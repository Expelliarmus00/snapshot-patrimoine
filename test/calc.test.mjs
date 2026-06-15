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
  // Apports ventilés Kevin/Aurélia
  const apports = Array.isArray(s.apports) ? s.apports : [];
  const apTot = a => num(a.kevin) + num(a.aurelia);
  const sumCat = cat => apports.filter(a => a.cat === cat).reduce((x, a) => x + apTot(a), 0);
  const sousLPP = sumCat('LPP'), sousCash = sumCat('Cash'), sousTroisA = sumCat('3a');
  const apportKevin = apports.reduce((x, a) => x + num(a.kevin), 0);
  const apportAurelia = apports.reduce((x, a) => x + num(a.aurelia), 0);
  const fpApports = apportKevin + apportAurelia;
  const fraisItems = Array.isArray(s.fraisItems) ? s.fraisItems : [];
  const fraisTotal = fraisItems.reduce((x, f) => x + num(f.kevin) + num(f.aurelia), 0);
  const fraisKevin = fraisItems.reduce((x, f) => x + num(f.kevin), 0);
  const fraisAurelia = fraisItems.reduce((x, f) => x + num(f.aurelia), 0);
  const coutOperation = num(s.prix.prixTotalActe) + fraisTotal;
  const decaisseReel = fpApports + fraisTotal;
  const decaisseKevin = apportKevin + fraisKevin;
  const decaisseAurelia = apportAurelia + fraisAurelia;
  const versement3aTotal = s.contrats.reduce((a, c) => a + num(c.versement), 0);
  return { base, hyp, r1, r2, ltv, tauxMoyen, interetsAnnuels, chargesPPE, fondsReno, amort, detentionAn, interetTheo, entretienTheo, chargeTheoAnnuelle, tauxEffort, revenu,
    sousLPP, sousCash, sousTroisA, apportKevin, apportAurelia, fpApports, fraisTotal, fraisKevin, fraisAurelia, coutOperation, decaisseReel, decaisseKevin, decaisseAurelia, versement3aTotal };
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
  fp: { total: 230000 },
  apports: [
    { id: 'a1', libelle: 'LPP — Kevin', cat: 'LPP', kevin: 86000, aurelia: 0 },
    { id: 'a2', libelle: 'LPP — Aurélia', cat: 'LPP', kevin: 0, aurelia: 29000 },
    { id: 'a3', libelle: 'Cash 1', cat: 'Cash', kevin: 10000, aurelia: 10000 },
    { id: 'a4', libelle: 'Cash 2', cat: 'Cash', kevin: 29000, aurelia: 29000 },
    { id: 'a5', libelle: '3a', cat: '3a', kevin: 18500, aurelia: 18500 },
  ],
  fraisItems: [
    { id: 'f1', libelle: 'Émolument acte vente', kevin: 1357.50, aurelia: 1357.50 },
    { id: 'f2', libelle: 'TVA vente', kevin: 109.95, aurelia: 109.95 },
    { id: 'f3', libelle: 'RF vente', kevin: 615, aurelia: 615 },
    { id: 'f4', libelle: 'Droits de mutation', kevin: 16950, aurelia: 16950 },
    { id: 'f5', libelle: 'Émolument acte gage', kevin: 1170, aurelia: 1170 },
    { id: 'f6', libelle: 'TVA gage', kevin: 94.78, aurelia: 94.77 },
    { id: 'f7', libelle: 'RF gage', kevin: 510, aurelia: 510 },
    { id: 'f8', libelle: 'Droit gages', kevin: 3450, aurelia: 3450 },
    { id: 'f9', libelle: 'Dossier banque', kevin: 460, aurelia: 460 },
    { id: 'f10', libelle: 'Courtier', kevin: 2300, aurelia: 2300 },
  ],
  tranches: [{ id: 'x', montant: 920000, taux: 1.8, type: 'Fixe', debut: '2026-09-01', echeance: '2031-09-01' }],
  charges: { chargesPPE: null, fondsReno: null, tauxTheorique: 5, entretienPct: 1, revenuBrut: null },
  contrats: [{ id: 'a', titulaire: 'Kevin', banque: '', versement: 7258 }, { id: 'b', titulaire: 'Aurélia', banque: '', versement: 3042 }],
  historique: [],
  rendement: 4,
};
const round2 = n => Math.round(n * 100) / 100;

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

test('Frais total = somme des actes notariés (48 514.45) + banque + courtier', () => {
  const c = calc(S);
  assert.equal(round2(c.fraisTotal), round2(38064.90 + 10449.55 + 920 + 4600)); // 54 034.45
});

test('Coût total opération = prix acte + frais total', () => {
  const c = calc(S);
  assert.equal(round2(c.coutOperation), round2(1130000 + c.fraisTotal));
});

test('Apports : agrégats LPP / Cash / 3a', () => {
  const c = calc(S);
  assert.equal(c.sousLPP, 115000);
  assert.equal(c.sousCash, 78000);
  assert.equal(c.sousTroisA, 37000);
  assert.equal(c.fpApports, 230000); // = fonds propres exigés
});

test('Répartition Kevin / Aurélia des apports', () => {
  const c = calc(S);
  assert.equal(c.apportKevin, 86000 + 10000 + 29000 + 18500);   // 143 500
  assert.equal(c.apportAurelia, 29000 + 10000 + 29000 + 18500); // 86 500
  assert.equal(c.apportKevin + c.apportAurelia, c.fpApports);
});

test('Décaissement réel = apports + frais (au centime près)', () => {
  const c = calc(S);
  assert.equal(round2(c.decaisseReel), round2(c.fpApports + c.fraisTotal));
  assert.equal(round2(c.decaisseKevin + c.decaisseAurelia), round2(c.decaisseReel));
});

test('Frais ventilés : Kevin + Aurélia = total frais', () => {
  const c = calc(S);
  assert.equal(round2(c.fraisKevin + c.fraisAurelia), round2(c.fraisTotal));
});

test('Décaissement ne contient PAS l\'hypothèque', () => {
  const c = calc(S);
  assert.ok(c.decaisseReel < c.hyp);            // 284k < 920k
  assert.equal(round2(c.decaisseReel), round2(230000 + 54034.45)); // 284 034.45
});

test('Écart base bancaire / prix acte = 20 000 (anticipation plus-value)', () => {
  const c = calc(S);
  assert.equal(c.base - c.hyp, 230000);          // fonds propres exigés sur base bancaire
  assert.equal(num(S.prix.prixTotalActe) - c.hyp, 210000); // apport "réel" sur prix acte
  assert.equal(c.fpApports - (num(S.prix.prixTotalActe) - c.hyp), 20000); // surplus volontaire
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
