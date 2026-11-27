/**
 * Matter Lab Ultra — liquid property layer (W32U-2, PARTIAL #4 fix).
 * Hansen solubility parameters [d,p,h] in MPa^0.5 and pKa values
 * (for bases: pKa of the conjugate acid). Real textbook values where
 * known; aqueous solutions sit near water; molten/metal liquids are
 * NOMINAL approximations (HSP theory is for molecular liquids) — see
 * build report. Pure ESM, no imports.
 */
const W = [15.5, 16.0, 42.3];       // water
const WS = [15.5, 15, 40];          // aqueous salt/base solution
const OIL = [16.2, 2, 3];
const FOOD = [16, 10, 30];
export const LIQUID_PROPS = {
  // waters
  'water': { hsp: W }, 'distilled-water': { hsp: W }, 'tap-water': { hsp: W },
  'distilled-lab-water': { hsp: W }, 'salt-water': { hsp: WS }, 'brine': { hsp: WS },
  'concentrated-seawater': { hsp: WS }, 'dirty-water': { hsp: [15.5,15.5,41] },
  'muddy-water': { hsp: [15.5,15.5,41] }, 'river-water': { hsp: W }, 'pond-water': { hsp: W },
  'rainwater': { hsp: W }, 'hard-water': { hsp: W }, 'mineral-water': { hsp: W },
  'spring-water': { hsp: W }, 'heavy-water': { hsp: [15.5,16,42] },
  'chlorinated-water': { hsp: W }, 'coconut-water': { hsp: [15.5,14,38] },
  'soda-water': { hsp: W, pka: 6.35 },
  // oils (vegetable ~[16,1-3,2-5], essential oils slightly more polar)
  'olive-oil': { hsp: [16.0,2.5,4.0] }, 'coconut-oil': { hsp: [16.2,2.0,3.5] },
  'mustard-oil': { hsp: [16.1,2.2,3.6] }, 'sunflower-oil': { hsp: [16.0,2.4,3.8] },
  'groundnut-oil': { hsp: OIL }, 'sesame-oil': { hsp: OIL }, 'castor-oil': { hsp: [16.5,4.5,8.5] },
  'almond-oil': { hsp: OIL }, 'canola-oil': { hsp: OIL }, 'soybean-oil': { hsp: OIL },
  'palm-oil': { hsp: OIL }, 'corn-oil': { hsp: OIL }, 'linseed-oil': { hsp: [16.3,3,4] },
  'mineral-oil': { hsp: [15.8,0.5,0.5] }, 'motor-oil': { hsp: [15.8,1,1] },
  'crude-oil': { hsp: [16,1,1] }, 'transformer-oil': { hsp: [15.8,0.5,0.5] },
  'silicone-oil': { hsp: [15.0,0.5,1.0] }, 'hydraulic-oil': { hsp: [15.9,1,1] },
  'brake-fluid': { hsp: [16.5,9,14] }, 'eucalyptus-oil': { hsp: [16.5,3.5,4.5] },
  'neem-oil': { hsp: [16.2,3,5] }, 'fish-oil': { hsp: [16.1,2.5,4] },
  'turpentine': { hsp: [16.2,1.5,1.2] }, 'liquid-paraffin': { hsp: [15.7,0,0] },
  'avocado-oil': { hsp: OIL }, 'grapeseed-oil': { hsp: OIL }, 'walnut-oil': { hsp: OIL },
  'argan-oil': { hsp: OIL }, 'jojoba-oil': { hsp: [16.0,2,3] },
  'citronella-oil': { hsp: [16.4,3,4.5] }, 'clove-oil': { hsp: [17.0,5,9] },
  'peppermint-oil': { hsp: [16.4,3.5,5] }, 'ferrofluid': { hsp: [15.8,0.5,0.5] },
  'immersion-oil': { hsp: [16.5,2,2] }, 'ghee': { hsp: [16.1,2.2,3.6] },
  // fuels & hydrocarbon solvents
  'petrol': { hsp: [15.2,0.5,0.5] }, 'diesel': { hsp: [15.8,0.5,0.5] },
  'kerosene': { hsp: [15.6,0.5,0.5] }, 'jet-fuel': { hsp: [15.6,0.5,0.5] },
  'biodiesel': { hsp: [16.2,3,5] }, 'naphtha': { hsp: [15.3,0,0] },
  'white-spirit': { hsp: [15.8,0.5,0.5] }, 'lpg-liquid': { hsp: [13.5,0,0] },
  'petroleum-ether': { hsp: [14.8,0,0] }, 'napalm': { hsp: [15.5,1,1] },
  'molotov-fuel': { hsp: [15.3,0.5,0.5] }, 'kerosene-gel': { hsp: [15.6,0.5,0.5] },
  // alcohols / glycols / common solvents
  'ethanol': { hsp: [15.8,8.8,19.4] }, 'methanol': { hsp: [15.1,12.3,22.3] },
  'isopropanol': { hsp: [15.8,6.1,16.4] }, 'butanol': { hsp: [16.0,5.7,15.8] },
  'acetone': { hsp: [15.5,10.4,7.0] }, 'benzene': { hsp: [18.4,0,2.0] },
  'toluene': { hsp: [18.0,1.4,2.0] }, 'xylene': { hsp: [17.8,1.0,3.1] },
  'hexane': { hsp: [14.9,0,0] }, 'pentane': { hsp: [14.5,0,0] }, 'heptane': { hsp: [15.3,0,0] },
  'octane': { hsp: [15.5,0,0] }, 'cyclohexane': { hsp: [16.8,0,0.2] },
  'diethyl-ether': { hsp: [14.5,2.9,5.1] }, 'ethyl-acetate': { hsp: [15.8,5.3,7.2] },
  'chloroform': { hsp: [17.8,3.1,5.7] }, 'dichloromethane': { hsp: [18.2,6.3,6.1] },
  'carbon-tetrachloride': { hsp: [17.8,0,0.6] }, 'trichloroethylene': { hsp: [18.0,3.1,5.3] },
  'perchloroethylene': { hsp: [18.3,5.7,0] }, 'ethylene-glycol': { hsp: [17.0,11.0,26.0] },
  'propylene-glycol': { hsp: [16.8,9.4,23.3] }, 'glycerol': { hsp: [17.4,12.1,29.3] },
  'acetonitrile': { hsp: [15.3,18.0,6.1] }, 'tetrahydrofuran': { hsp: [16.8,5.7,8.0] },
  'carbon-disulfide': { hsp: [20.5,0,0.6] }, 'dmso': { hsp: [18.4,16.4,10.2] },
  'nitrobenzene': { hsp: [20.0,8.6,4.1] }, 'aniline': { hsp: [19.4,5.1,10.0], pka: 4.6 },
  'mek': { hsp: [16.0,9.0,5.1] }, 'canada-balsam': { hsp: [16.5,3,4] },
  'vodka': { hsp: [15.6,11,28] }, 'whisky': { hsp: [15.6,11,28] }, 'rum': { hsp: [15.6,11,28] },
  'beer': { hsp: [15.5,14,38] }, 'wine': { hsp: [15.5,13,36] },
  'chafing-gel': { hsp: [15.8,8.8,19.4] }, 'ethanol-gel': { hsp: [15.8,8.8,19.4] },
  'ethanol-gel-lab': { hsp: [15.8,8.8,19.4] }, 'formalin': { hsp: [15.5,14,36] },
  // hot liquids — NOMINAL
  'lava': { hsp: [15,3,3] }, 'magma': { hsp: [15,3,3] }, 'molten-rock': { hsp: [15,3,3] },
  'molten-glass': { hsp: [15,4,4] }, 'molten-salt': { hsp: [15.5,10,10] },
  'molten-sulfur': { hsp: [18,3,2] }, 'molten-wax': { hsp: [16,1,2] }, 'wax-molten': { hsp: [16,1,2] },
  'molten-chocolate': { hsp: [16.5,5,10] }, 'molten-butter': { hsp: [16.2,3,5] },
  'molten-sugar': { hsp: [17,11,26] }, 'tar': { hsp: [17,3,3] }, 'bitumen': { hsp: [17,3,3] },
  'pitch': { hsp: [17.5,3.5,3.5] },
  // metal liquids — NOMINAL (HSP not physically defined for metals)
  'mercury': { hsp: [14,4,4] }, 'bromine': { hsp: [17.5,4,5] },
  // food liquids
  'milk': { hsp: [16,10,30] }, 'skimmed-milk': { hsp: [15.8,12,34] }, 'cream': { hsp: [16.2,6,18] },
  'buttermilk': { hsp: [15.8,12,34], pka: 4.5 }, 'honey': { hsp: [17,11,27] },
  'maple-syrup': { hsp: [16.8,11,27] }, 'sugar-syrup': { hsp: [16.5,12,30] },
  'molasses': { hsp: [16.8,11,27] }, 'ketchup': { hsp: FOOD, pka: 3.9 },
  'soy-sauce': { hsp: [15.8,13,34], pka: 4.8 },
  'orange-juice': { hsp: [15.6,13,36], pka: 3.5 }, 'apple-juice': { hsp: [15.6,13,36], pka: 3.6 },
  'lemon-juice': { hsp: [15.6,13,36], pka: 2.3 }, 'mango-juice': { hsp: FOOD },
  'grape-juice': { hsp: FOOD, pka: 3.4 }, 'pineapple-juice': { hsp: FOOD, pka: 3.5 },
  'tomato-juice': { hsp: FOOD, pka: 4.3 }, 'coffee': { hsp: [15.6,13,36], pka: 5.0 },
  'tea': { hsp: [15.6,13,36] }, 'cola': { hsp: [15.6,13,36], pka: 2.5 },
  'lemonade': { hsp: [15.6,13,36], pka: 3.1 }, 'blood': { hsp: [15.8,12,32] },
  'yogurt-drink': { hsp: FOOD, pka: 4.4 }, 'sugarcane-juice': { hsp: FOOD },
  'coconut-milk': { hsp: [16,8,24] }, 'almond-milk': { hsp: FOOD }, 'soy-milk': { hsp: FOOD },
  'oat-milk': { hsp: FOOD }, 'whey': { hsp: FOOD, pka: 4.6 },
  'watermelon-juice': { hsp: FOOD }, 'pomegranate-juice': { hsp: FOOD, pka: 3.2 },
  'carrot-juice': { hsp: FOOD }, 'beetroot-juice': { hsp: FOOD }, 'aloe-vera-juice': { hsp: FOOD },
  'tamarind-juice': { hsp: FOOD, pka: 3.0 },
  // cryogens — NOMINAL
  'liquid-nitrogen': { hsp: [12,2,2] }, 'liquid-oxygen': { hsp: [13,3,2] },
  'liquid-helium': { hsp: [8,0,0] }, 'liquid-hydrogen': { hsp: [10,0,0] },
  'liquid-air': { hsp: [12.5,2,2] }, 'liquid-co2': { hsp: [15,4,4] },
  'liquid-methane': { hsp: [13,0,0] }, 'liquid-argon': { hsp: [12,1,1] },
  'liquid-neon': { hsp: [10,0,0] }, 'liquid-propane': { hsp: [13.5,0,0] },
  // acids (pKa: stronger acid = lower)
  'hydrochloric-acid': { hsp: WS, pka: -6 }, 'sulfuric-acid': { hsp: [15.5,13,34], pka: -3 },
  'nitric-acid': { hsp: WS, pka: -1.4 }, 'acetic-acid': { hsp: [14.5,8.0,13.5], pka: 4.76 },
  'citric-acid-sol': { hsp: WS, pka: 3.13 }, 'phosphoric-acid': { hsp: WS, pka: 2.15 },
  'carbonic-acid': { hsp: W, pka: 6.35 }, 'aqua-regia': { hsp: WS, pka: -6 },
  'hydrofluoric-acid': { hsp: WS, pka: 3.17 }, 'formic-acid': { hsp: [14.5,10,18], pka: 3.75 },
  'lactic-acid': { hsp: [16,9,20], pka: 3.86 }, 'sulfurous-acid': { hsp: WS, pka: 1.85 },
  'perchloric-acid': { hsp: WS, pka: -10 }, 'chromic-acid': { hsp: WS, pka: -0.8 },
  'hydrobromic-acid': { hsp: WS, pka: -9 }, 'oleic-acid': { hsp: [16.2,2.5,4.5], pka: 4.8 },
  'ph-0-fluid-fun': { hsp: WS, pka: -6 },
  // bases (pKa of conjugate acid)
  'sodium-hydroxide': { hsp: WS, pka: 15.7 }, 'potassium-hydroxide': { hsp: WS, pka: 15.7 },
  'ammonia-solution': { hsp: [15.5,14,38], pka: 9.25 }, 'limewater': { hsp: WS, pka: 12.4 },
  'washing-soda-sol': { hsp: WS, pka: 10.33 }, 'baking-soda-sol': { hsp: WS, pka: 6.35 },
  'milk-of-magnesia': { hsp: WS, pka: 11.25 }, 'bleach': { hsp: [15.5,14,38], pka: 7.5 },
  'hydrazine': { hsp: [16,10,20], pka: 8.1 }, 'soap-sol': { hsp: [16,10,25], pka: 10 },
  'detergent-sol': { hsp: [16,10,25], pka: 10 }, 'soap-solution': { hsp: [16,10,25], pka: 10 },
  'detergent-solution': { hsp: [16,10,25], pka: 10 }, 'detergent-water': { hsp: [16,10,25], pka: 10 },
  'barium-hydroxide-sol': { hsp: WS, pka: 13.4 }, 'lithium-hydroxide-sol': { hsp: WS, pka: 13.8 },
  'ph-14-fluid-fun': { hsp: WS, pka: 15.7 },
  'sodium-phosphate-sol': { hsp: WS, pka: 12.35 }, 'borax-sol': { hsp: WS, pka: 9.24 },
  'sodium-acetate-sol': { hsp: WS, pka: 4.76 }, 'ammonium-carbonate-sol': { hsp: WS, pka: 9.25 },
  'ammonium-acetate-sol': { hsp: WS, pka: 9.25 },
  // peroxides / misc chem
  'hydrogen-peroxide': { hsp: [15.5,14,38], pka: 11.6 }, 'peroxide-conc': { hsp: [15.5,14,38], pka: 11.6 },
  'nitroglycerin': { hsp: [17,10,8] }, 'glucose-sol': { hsp: [16,12,30] },
  'starch-sol': { hsp: [16,11,29] },
  'saliva-fun': { hsp: [15.6,13,36] }, 'urine-fun': { hsp: [15.6,13,36], pka: 9.25 },
  'ink': { hsp: [16,10,20] }, 'paint': { hsp: [17,6,6] }, 'varnish': { hsp: [17,5,5] },
  'latex': { hsp: [16,8,18] }, 'epoxy-resin': { hsp: [18,8,6] }, 'glue': { hsp: [16,10,22] },
  'cyanoacrylate': { hsp: [17,9,6] }, 'silicone-sealant': { hsp: [15,1,1] },
  'silicone-sealant-liquid': { hsp: [15,1,1] }, 'electrolyte-paste': { hsp: WS },
  'buffer-ph7': { hsp: WS, pka: 7.2 }, 'iodine-tincture': { hsp: [15.8,8,19] },
  'glow-stick-fluid': { hsp: [17,6,6] }, 'stage-slime': { hsp: [16,10,24] },
};
// every *-molten metal/alloy liquid: nominal metal HSP
for (const k of ['potassium-molten','sodium-molten','lithium-molten','calcium-molten','magnesium-molten','aluminium-molten','zinc-molten','chromium-molten','iron-molten','nickel-molten','tin-molten','lead-molten','copper-molten','silver-molten','gold-molten','platinum-molten','palladium-molten','cobalt-molten','manganese-molten','molybdenum-molten','tungsten-molten','titanium-molten','vanadium-molten','cadmium-molten','bismuth-molten','antimony-molten','beryllium-molten','silicon-molten','germanium-molten','uranium-molten','steel-molten','stainless-steel-molten','carbon-steel-molten','cast-iron-molten','brass-molten','bronze-molten','phosphor-bronze-molten','aluminium-bronze-molten','solder-molten','nichrome-molten','pewter-molten','duralumin-molten','magnalium-molten','alnico-molten','invar-molten','constantan-molten','electrum-molten','sterling-silver-molten','rose-gold-molten','white-gold-molten','monel-molten','gunmetal-molten','bell-metal-molten','babbit-metal-molten','woods-metal-molten','amalgam-molten'])
  LIQUID_PROPS[k] = { hsp: [14, 4, 4] };

/**
 * Miscibility with water (W32U-2 FIX-A) — measured-solubility classes,
 * the formulator's companion to HSP: Hansen distance alone calls
 * ethanol×water immiscible (Ra≈24), which is chemically false.
 * Classes by solubility in water at ~20 °C:
 *   'miscible'   — mixes in all proportions (or is itself water-based)
 *   'partial'    — ~1–10 g/100 ml (butanol 7.7, ethyl-acetate ~8,
 *                  diethyl-ether ~6, aniline ~3.6, bromine ~3.5,
 *                  dichloromethane ~1.3, MEK partial-miscible)
 *   'immiscible' — <1 g/100 ml, oils/hydrocarbons, molten phases,
 *                  cryogens (they boil off rather than mix)
 * Explicit entries below cover every LIQUID_PROPS key plus liquid
 * keys that live only in the category modules.
 */
export const SOLWATER = {
  // waters — they ARE water / water with traces
  'water': 'miscible', 'distilled-water': 'miscible', 'tap-water': 'miscible',
  'distilled-lab-water': 'miscible', 'salt-water': 'miscible', 'brine': 'miscible',
  'concentrated-seawater': 'miscible', 'dirty-water': 'miscible',
  'muddy-water': 'miscible', 'river-water': 'miscible', 'pond-water': 'miscible',
  'rainwater': 'miscible', 'hard-water': 'miscible', 'mineral-water': 'miscible',
  'spring-water': 'miscible', 'heavy-water': 'miscible',
  'chlorinated-water': 'miscible', 'coconut-water': 'miscible', 'soda-water': 'miscible',
  // oils & oil-like — all immiscible (brake fluid is glycol-based: miscible)
  'olive-oil': 'immiscible', 'coconut-oil': 'immiscible', 'mustard-oil': 'immiscible',
  'sunflower-oil': 'immiscible', 'groundnut-oil': 'immiscible', 'sesame-oil': 'immiscible',
  'castor-oil': 'immiscible', 'almond-oil': 'immiscible', 'canola-oil': 'immiscible',
  'soybean-oil': 'immiscible', 'palm-oil': 'immiscible', 'corn-oil': 'immiscible',
  'linseed-oil': 'immiscible', 'mineral-oil': 'immiscible', 'motor-oil': 'immiscible',
  'crude-oil': 'immiscible', 'transformer-oil': 'immiscible', 'silicone-oil': 'immiscible',
  'hydraulic-oil': 'immiscible', 'brake-fluid': 'miscible', 'eucalyptus-oil': 'immiscible',
  'neem-oil': 'immiscible', 'fish-oil': 'immiscible', 'turpentine': 'immiscible',
  'liquid-paraffin': 'immiscible', 'avocado-oil': 'immiscible', 'grapeseed-oil': 'immiscible',
  'walnut-oil': 'immiscible', 'argan-oil': 'immiscible', 'jojoba-oil': 'immiscible',
  'citronella-oil': 'immiscible', 'clove-oil': 'immiscible', 'peppermint-oil': 'immiscible',
  'ferrofluid': 'immiscible', 'immersion-oil': 'immiscible', 'ghee': 'immiscible',
  // fuels & hydrocarbons — immiscible
  'petrol': 'immiscible', 'diesel': 'immiscible', 'kerosene': 'immiscible',
  'jet-fuel': 'immiscible', 'biodiesel': 'immiscible', 'naphtha': 'immiscible',
  'white-spirit': 'immiscible', 'lpg-liquid': 'immiscible', 'petroleum-ether': 'immiscible',
  'napalm': 'immiscible', 'molotov-fuel': 'immiscible', 'kerosene-gel': 'immiscible',
  // alcohols / glycols / polar solvents — miscible unless noted
  'ethanol': 'miscible', 'methanol': 'miscible', 'isopropanol': 'miscible',
  'butanol': 'partial', 'acetone': 'miscible', 'benzene': 'immiscible',
  'toluene': 'immiscible', 'xylene': 'immiscible', 'hexane': 'immiscible',
  'pentane': 'immiscible', 'heptane': 'immiscible', 'octane': 'immiscible',
  'cyclohexane': 'immiscible', 'diethyl-ether': 'partial', 'ethyl-acetate': 'partial',
  'chloroform': 'immiscible', 'dichloromethane': 'partial',
  'carbon-tetrachloride': 'immiscible', 'trichloroethylene': 'immiscible',
  'perchloroethylene': 'immiscible', 'ethylene-glycol': 'miscible',
  'propylene-glycol': 'miscible', 'glycerol': 'miscible', 'acetonitrile': 'miscible',
  'tetrahydrofuran': 'miscible', 'carbon-disulfide': 'immiscible', 'dmso': 'miscible',
  'nitrobenzene': 'immiscible', 'aniline': 'partial', 'mek': 'partial',
  'canada-balsam': 'immiscible',
  'vodka': 'miscible', 'whisky': 'miscible', 'rum': 'miscible',
  'beer': 'miscible', 'wine': 'miscible', 'chafing-gel': 'miscible',
  'ethanol-gel': 'miscible', 'ethanol-gel-lab': 'miscible', 'formalin': 'miscible',
  // hot liquids / molten phases — immiscible
  'lava': 'immiscible', 'magma': 'immiscible', 'molten-rock': 'immiscible',
  'molten-glass': 'immiscible', 'molten-salt': 'immiscible', 'molten-sulfur': 'immiscible',
  'molten-wax': 'immiscible', 'wax-molten': 'immiscible', 'molten-chocolate': 'immiscible',
  'molten-butter': 'immiscible', 'molten-sugar': 'immiscible', 'tar': 'immiscible',
  'bitumen': 'immiscible', 'pitch': 'immiscible',
  // elemental liquids
  'mercury': 'immiscible', 'bromine': 'partial',
  // food liquids — water-based, miscible (ghee above is the fat exception)
  'milk': 'miscible', 'skimmed-milk': 'miscible', 'cream': 'miscible',
  'buttermilk': 'miscible', 'honey': 'miscible', 'maple-syrup': 'miscible',
  'sugar-syrup': 'miscible', 'molasses': 'miscible', 'ketchup': 'miscible',
  'soy-sauce': 'miscible', 'orange-juice': 'miscible', 'apple-juice': 'miscible',
  'lemon-juice': 'miscible', 'mango-juice': 'miscible', 'grape-juice': 'miscible',
  'pineapple-juice': 'miscible', 'tomato-juice': 'miscible', 'coffee': 'miscible',
  'tea': 'miscible', 'cola': 'miscible', 'lemonade': 'miscible', 'blood': 'miscible',
  'yogurt-drink': 'miscible', 'sugarcane-juice': 'miscible', 'coconut-milk': 'miscible',
  'almond-milk': 'miscible', 'soy-milk': 'miscible', 'oat-milk': 'miscible',
  'whey': 'miscible', 'watermelon-juice': 'miscible', 'pomegranate-juice': 'miscible',
  'carrot-juice': 'miscible', 'beetroot-juice': 'miscible', 'aloe-vera-juice': 'miscible',
  'tamarind-juice': 'miscible',
  // cryogens — boil off rather than mix: immiscible
  'liquid-nitrogen': 'immiscible', 'liquid-oxygen': 'immiscible',
  'liquid-helium': 'immiscible', 'liquid-hydrogen': 'immiscible',
  'liquid-air': 'immiscible', 'liquid-co2': 'immiscible',
  'liquid-methane': 'immiscible', 'liquid-argon': 'immiscible',
  'liquid-neon': 'immiscible', 'liquid-propane': 'immiscible',
  // acids — aqueous, miscible (oleic acid is a fatty acid: immiscible)
  'hydrochloric-acid': 'miscible', 'sulfuric-acid': 'miscible', 'nitric-acid': 'miscible',
  'acetic-acid': 'miscible', 'citric-acid-sol': 'miscible', 'phosphoric-acid': 'miscible',
  'carbonic-acid': 'miscible', 'aqua-regia': 'miscible', 'hydrofluoric-acid': 'miscible',
  'formic-acid': 'miscible', 'lactic-acid': 'miscible', 'sulfurous-acid': 'miscible',
  'perchloric-acid': 'miscible', 'chromic-acid': 'miscible', 'hydrobromic-acid': 'miscible',
  'oleic-acid': 'immiscible', 'ph-0-fluid-fun': 'miscible',
  // bases & aqueous alkaline solutions — miscible
  'sodium-hydroxide': 'miscible', 'potassium-hydroxide': 'miscible',
  'ammonia-solution': 'miscible', 'limewater': 'miscible', 'washing-soda-sol': 'miscible',
  'baking-soda-sol': 'miscible', 'milk-of-magnesia': 'miscible', 'bleach': 'miscible',
  'hydrazine': 'miscible', 'soap-sol': 'miscible', 'barium-hydroxide-sol': 'miscible',
  'lithium-hydroxide-sol': 'miscible', 'ph-14-fluid-fun': 'miscible',
  'sodium-phosphate-sol': 'miscible', 'borax-sol': 'miscible',
  'sodium-acetate-sol': 'miscible', 'ammonium-carbonate-sol': 'miscible',
  'ammonium-acetate-sol': 'miscible',
  // soaps / detergents — miscible
  'soap-solution': 'miscible', 'detergent-sol': 'miscible',
  'detergent-solution': 'miscible',
  'detergent-water': 'miscible',
  // peroxides / misc chem
  'hydrogen-peroxide': 'miscible', 'peroxide-conc': 'miscible',
  'nitroglycerin': 'immiscible', 'glucose-sol': 'miscible', 'starch-sol': 'miscible',
  'saliva-fun': 'miscible', 'urine-fun': 'miscible', 'ink': 'miscible',
  'paint': 'immiscible', 'varnish': 'immiscible', 'latex': 'miscible',
  'epoxy-resin': 'immiscible', 'glue': 'miscible', 'cyanoacrylate': 'immiscible',
  'silicone-sealant': 'immiscible', 'silicone-sealant-liquid': 'immiscible',
  'electrolyte-paste': 'miscible', 'buffer-ph7': 'miscible',
  'iodine-tincture': 'miscible', 'glow-stick-fluid': 'immiscible',
  'stage-slime': 'miscible',
  // liquid keys that live only in the category modules
  'slurry-explosive': 'immiscible', 'fake-blood': 'miscible',
};
// every *-molten metal/alloy liquid: immiscible with water
for (const k of ['potassium-molten','sodium-molten','lithium-molten','calcium-molten','magnesium-molten','aluminium-molten','zinc-molten','chromium-molten','iron-molten','nickel-molten','tin-molten','lead-molten','copper-molten','silver-molten','gold-molten','platinum-molten','palladium-molten','cobalt-molten','manganese-molten','molybdenum-molten','tungsten-molten','titanium-molten','vanadium-molten','cadmium-molten','bismuth-molten','antimony-molten','beryllium-molten','silicon-molten','germanium-molten','uranium-molten','steel-molten','stainless-steel-molten','carbon-steel-molten','cast-iron-molten','brass-molten','bronze-molten','phosphor-bronze-molten','aluminium-bronze-molten','solder-molten','nichrome-molten','pewter-molten','duralumin-molten','magnalium-molten','alnico-molten','invar-molten','constantan-molten','electrum-molten','sterling-silver-molten','rose-gold-molten','white-gold-molten','monel-molten','gunmetal-molten','bell-metal-molten','babbit-metal-molten','woods-metal-molten','amalgam-molten'])
  SOLWATER[k] = 'immiscible';

export const SOLWATER_FAM = {
  'aqueous': 'miscible', 'salt-sol': 'miscible', 'ionic-sol': 'miscible',
  'dye': 'miscible', 'indicator': 'miscible', 'food': 'miscible',
  'soap': 'miscible', 'bleach': 'miscible', 'peroxide': 'miscible',
  'acid': 'miscible', 'base': 'miscible',
  'oil': 'immiscible', 'fuel': 'immiscible', 'hot-liquid': 'immiscible',
  'metal': 'immiscible', 'cryogen': 'immiscible', 'wax': 'immiscible',
  'solvent': 'partial',
};
export const LIQUID_SOLWATER_FALLBACK = 'immiscible';

export const LIQUID_FAM_HSP = {
  'aqueous': [15.5, 15.5, 41], 'salt-sol': [15.5, 15, 40], 'ionic-sol': [15.5, 15, 40],
  'oil': [16.2, 2, 3], 'fuel': [15.5, 0.5, 0.5], 'solvent': [16, 7, 7],
  'hot-liquid': [15, 3, 3], 'dye': [16, 10, 20], 'indicator': [16, 10, 20],
  'food': [16, 10, 28], 'soap': [16, 10, 25], 'bleach': [15.5, 14, 38],
  'peroxide': [15.5, 14, 38],
};
export const LIQUID_HSP_FALLBACK = [15.5, 8, 14];
