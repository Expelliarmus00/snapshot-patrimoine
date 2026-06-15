/**
 * Tests de régression pour les formules financières de l'app Patrimoine.
 * Miroir des fonctions calc(), compareSeries(), projectionSeries() de public/index.html.
 * Lance avec : node --test test/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── helpers (identiques à index.html) ─────────────────────────────────────
function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function calc(state) {
  const s = state;
  const base = num(s.prix.baseBancaire), hyp = num(s.fin.hypotheque);
  const r2 = num(s.fin.deuxiemeRang), r1 = Math.max(0, hyp - r2);
  const ltv = base > 0 ? hyp / base * 100 : 0;
  let mt = 0, wt = 0;
  s.tranches.forEach(t => { const m = num(t.montant); mt += m; wt += m * num(t.taux); });
  const tauxMoyen = mt > 0 ? wt / mt : 0;
  const interetsAnnuels = s.tranches.reduce((a, t) => a + num(t.montant) * num(t.taux) / 100, 0);
  const chargesPPE = num(s.charges.chargesPPE), fondsReno = num(s.charges.fondsReno), amort = num(s.fin.amortAnnuel);
  const detentionAn = interetsAnnuels + amort + chargesPPE + fondsReno;
  const tauxTheo = num(s.charges.tauxTheorique);
  const entretienTheo = base * num(s.charges.entretienPct) / 100;
  const interetTheo = hyp * tauxTheo / 100;
  const chargeTheoAnnuelle = interetTheo + amort + entretienTheo;
  const revenu = num(s.charges.revenuBrut);
  const tauxEffort = revenu > 0 ? chargeTheoAnnuelle / revenu * 100 : null;
  const fp = s.fp;
  const sousLPP = num(fp.lppKevin) + num(fp.lppAurelia);
  const sousCash = num(fp.cashAcompte1) + num(fp.cashAcompte2);
  const fpTotal = num(fp.total);
  const fraisTotal = num(s.frais.notaire) + num(s.frais.dossierBanque) + num(s.frais.courtier);
  const coutOperation = num(s.prix.prixTotalActe) + fraisTotal;
  const versement3aTotal = s.contrats.reduce((a, c) => a + num(c.versement), 0);
  return { base, hyp, r1, r2, ltv, tauxMoyen, interetsAnnuels, chargesPPE, fondsReno, amort, detentionAn, interetTheo, entretienTheo, chargeTheoAnnuelle, tauxEffort, revenu, sousLPP, sousCash, fpTotal, fraisTotal, coutOperation, versement3aTotal };
}

function compareSeries(state, rendement) {
  const c = calc(state), horizon = num(state.fin.dureeAmort), tx = c.tauxMoyen / 100, amort = num(state.fin.amortAnnuel);
  const interIndirect = [], interDirect = [], capital3a = [];
  let cumInd = 0, cumDir = 0, dette = c.hyp, cap = 0;
  const versement = c.versement3aTotal;
  for (let y = 0; y <= horizon; y++) {
    if (y > 0) { cumInd += c.hyp * tx; cumDir += dette * tx; dette = Math.max(c.r1, dette - amort); cap = cap * (1 + rendement / 100) + versement; }
    interIndirect.push(cumInd); interDirect.push(cumDir); capital3a.push(cap);
  }
  return { horizon, interIndirect, interDirect, capital3a, detteFinaleDirect: dette, detteFinaleIndirect: c.hyp, interTotalIndirect: cumInd, interTotalDirect: cumDir, capitalFinal: cap, surcout: cumInd - cumDir };
}

// ── fixture (données réelles de l'app) ────────────────────────────────────
const S = {
  prix: { appartement: 1090000, placeCouverte: 25000, placeNonCouverte: 15000, prixTotalActe: 1130000, baseBancaire: 1150000 },
  fin: { hypotheque: 920000, deuxiemeRang: 154500, amortAnnuel: 10300, dureeAmort: 15 },
  fp: { lppKevin: 86000, lppAurelia: 29000, cashAcompte1: 20000, cashAcompte2: 58000, troisA: 37000, total: 230000 },
  frais: { notaire: null, dossierBanque: 920, courtier: 4600 },
  tranches: [{ id: 'x', montant: 920000, taux: 1.8, type: 'Fixe', debut: '2026-09-01', echeance: '2031-09-01' }],
  charges: { chargesPPE: null, fondsReno: null, tauxTheorique: 5, entretienPct: 1, revenuBrut: null },
  contrats: [{ id: 'a', titulaire: 'Kevin', banque: '', versement: 7258 }, { id: 'b', titulaire: 'Aurélia', banque: '', versement: 3042 }],
  historique: [],
  rendement: 4,
};

// ── tests ──────────────────────────────────────────────────────────────────
test('LTV ≈ 80 %', () => {
  const c = calc(S);
  assert.ok(Math.abs(c.ltv - (920000 / 1150000 * 100)) < 0.001);
  assert.ok(c.ltv > 79.9 && c.ltv < 80.1);
});

test('Rangs : r2 = 154 500, r1 = 765 500', () => {
  const c = calc(S);
  assert.equal(c.r2, 154500);
  assert.equal(c.r1, 920000 - 154500);
});

test('Intérêts annuels = montant × taux / 100', () => {
  const c = calc(S);
  assert.ok(Math.abs(c.interetsAnnuels - 920000 * 1.8 / 100) < 0.001); // 16 560
});

test('Taux moyen pondéré : 2 tranches', () => {
  const s2 = { ...S, tranches: [
    { id: 'a', montant: 500000, taux: 1.5, type: 'Fixe', debut: '', echeance: '' },
    { id: 'b', montant: 420000, taux: 2.1, type: 'SARON', debut: '', echeance: '' },
  ]};
  const c = calc(s2);
  const expected = (500000 * 1.5 + 420000 * 2.1) / 920000;
  assert.ok(Math.abs(c.tauxMoyen - expected) < 0.0001);
});

test('Charge théorique FINMA 5 %', () => {
  const c = calc(S);
  // intérêt théo 5% + amort + entretien 1% base
  const expected = 920000 * 5 / 100 + 10300 + 1150000 * 1 / 100;
  assert.ok(Math.abs(c.chargeTheoAnnuelle - expected) < 0.001); // 67 800
});

test('Taux d\'effort null sans revenu', () => {
  assert.equal(calc(S).tauxEffort, null);
});

test('Taux d\'effort calculé avec revenu', () => {
  const c = calc({ ...S, charges: { ...S.charges, revenuBrut: 150000 } });
  assert.notEqual(c.tauxEffort, null);
  assert.ok(c.tauxEffort > 0 && c.tauxEffort < 100);
});

test('Coût total opération = prix acte + frais (notaire null → 0)', () => {
  const c = calc(S);
  assert.equal(c.coutOperation, 1130000 + 0 + 920 + 4600);
});

test('Versement 3a total = somme des contrats', () => {
  const c = calc(S);
  assert.equal(c.versement3aTotal, 7258 + 3042);
});

test('Détention annuelle = intérêts + amort (PPE/réno nuls)', () => {
  const c = calc(S);
  assert.ok(Math.abs(c.detentionAn - (c.interetsAnnuels + c.amort)) < 0.001);
});

test('compareSeries : dette indirecte reste constante (920 000)', () => {
  const cmp = compareSeries(S, 4);
  assert.equal(cmp.detteFinaleIndirect, 920000);
});

test('compareSeries : dette directe diminue mais pas sous le 1er rang', () => {
  const cmp = compareSeries(S, 4);
  assert.ok(cmp.detteFinaleDirect < 920000);
  assert.ok(cmp.detteFinaleDirect >= 765500); // plancher = r1
});

test('compareSeries : surcoût indirect positif (plus d\'intérêts payés)', () => {
  const cmp = compareSeries(S, 4);
  assert.ok(cmp.surcout > 0);
});

test('compareSeries : capital final > versements bruts avec rendement > 0', () => {
  const cmp = compareSeries(S, 4);
  const versementsBruts = (S.contrats[0].versement + S.contrats[1].versement) * S.fin.dureeAmort;
  assert.ok(cmp.capitalFinal > versementsBruts);
});

test('compareSeries : capital final = 0 avec rendement = 0 et versement = 0', () => {
  const s0 = { ...S, contrats: [{ id: 'a', titulaire: 'T', banque: '', versement: 0 }] };
  const cmp = compareSeries(s0, 0);
  assert.equal(cmp.capitalFinal, 0);
});

test('num() : gère null/undefined/vide → 0', () => {
  assert.equal(num(null), 0);
  assert.equal(num(undefined), 0);
  assert.equal(num(''), 0);
  assert.equal(num('1 234.5'), 1234.5); // strip non-numeric except dot/minus
});
