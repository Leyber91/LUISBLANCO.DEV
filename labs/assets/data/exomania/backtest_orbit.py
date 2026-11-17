#!/usr/bin/env python3
"""Which orbit does the page use: the archive's, or Kepler's third law? A backtest on the snapshot and on the papers.

The composite table (PSCompPars) takes each planet's values from the paper it judges best for each one, so a planet's
orbit can come from one paper and its star from another. The page computes the starlight from the star's radius and
temperature and the orbit (starlight.js), so an orbit that belongs to another solution for the star, or to another
period, moves the starlight, the zone and what the picture draws. Kepler-1649 c showed it on 2026-11-16: the archive's
0.0649 AU comes from the Q1-Q17 DR25 KOI table, which used a star of 0.096 solar masses; its period and its star come
from Vanderburg et al. 2020 (0.1977 solar masses), from which Kepler's law gives 0.0827 AU, and that paper states 74%
of Earth's flux (arXiv:2004.06725, abstract, read 2026-11-17).

This script is how the rule was chosen (2026-11-17), and how it can be checked again after the snapshot changes. It is
run by hand and writes nothing.

1. Over the snapshot: for every planet with a period and a star's mass (none of them a limit), Kepler's third law with
   the star's mass plus the planet's own where it is measured (a minimum mass counts). How many agree with the archive's
   orbit within 5, 10 and 20%; for how many the starlight computed from the star (S = (R/a)^2 (Teff / 5772 K)^4, point
   values) differs from the archive's insolation by more than 1.2 times, under each orbit; and how many planets change
   zone (Kopparapu et al. 2013, conservative and optimistic) under each orbit, against main before ticket 2.14, which
   placed the zone by the archive's insolation. The page counts zones on the median of its draws; these are point
   values, so a planet within a hair of an edge can count differently.
2. Against the papers: SAMPLE below holds, for 25 of the planets whose orbit is more than 10% off Kepler's law, every
   paper the archive's PS table lists for them (its orbit, period, star's mass and insolation as the archive transcribed
   them), fetched from the archive's TAP service on 2026-11-17. 22 were drawn with random.Random(214) from the sorted
   names, and the famous worlds among the 216 were added (Kepler-1649 c, Kepler-1646 b, HD 28109 b). A paper votes
   only if it describes the composite's star and orbit (its star's mass within 10% of the composite's, its period
   within 5%), and the paper the archive took the orbit from does not vote: it cannot settle a question about its own
   number. Each voting paper's stated orbit votes for the archive's value or Kepler's (whichever it is within 5% of),
   and its stated insolation for the orbit whose starlight it is within 20% of.
3. The verdict: the rule the votes support. For the planets left undecided, also listed: those where another paper,
   on another star's mass, states the archive's orbit, and those where one states Kepler's. Where the archive's orbit
   has that company, the composite's star may be the outlier (on 2026-11-17, two of the six took their star's mass from
   Stassun et al. 2017 and three from Morton et al. 2016), and Kepler's law then carries that mass into the orbit: the
   cost of the rule, read by hand in the ledger.

Usage:
  python backtest_orbit.py .        # in the folder that holds pscomppars-snapshot.json
"""
import json, os, sys

sys.dont_write_bytecode = True                                                # this folder is published: leave no cache in it

M_EARTH_IN_SUN = 3.986004e14 / 1.3271244e20                                    # the ratio of the two GM, IAU 2015 nominal
TRUE_MASS = {'Mass', 'Msini', 'Msin(i)/sin(i)'}
KOPPARAPU = {'tRange': (2600, 7200), 'recentVenus': [1.7763, 1.4335e-4, 3.3954e-9, -7.6364e-12, -1.1950e-15],
             'runaway': [1.0385, 1.2456e-4, 1.4612e-8, -7.6345e-12, -1.7511e-15], 'maxGreen': [0.3507, 5.9578e-5, 1.6707e-9, -3.0058e-12, -5.1925e-16],
             'earlyMars': [0.3207, 5.4471e-5, 1.5275e-9, -2.1709e-12, -3.8282e-16]}

# The papers, as the archive transcribed them: TAP service of the NASA Exoplanet Archive, tables pscomppars (the
# reference of each value) and ps (one row per paper), queried 2026-11-17. Each paper: [name, orbit AU, period d,
# star's mass M_sun, insolation S_earth]; None where the paper's row gives none. A paper listed twice is kept once.
SAMPLE = [
    {"planet": "Kepler-32 c", "a": 0.09, "a_ref": "Fabrycky et al. 2012", "P": 8.7522, "P_ref": "Fabrycky et al. 2012", "Ms": 0.58, "Ms_ref": "Fabrycky et al. 2012", "papers": [["Dressing & Charbonneau 2013", None, 8.752, 0.514, 10.68], ["Q1-Q12 KOI Table", 0.0669, 8.75210645, 0.52, 9.65], ["Mann et al. 2013", None, None, 0.566, 10.692], ["Q1-Q17 DR24 KOI Table", 0.0669, 8.75210645, 0.52, 9.65], ["Hadden et al. 2014", None, 8.752, 0.566, None], ["Gaidos et al. 2024", None, 8.75, None, None], ["Muirhead et al. 2012", 0.06699, 8.75245953, 0.52, None], ["Q1-Q8 KOI Table", 0.068, 8.752167, 0.549, None], ["Q1-Q17 DR25 Supplemental KOI Table", None, 8.75209691, 0.566709, None], ["Q1-Q17 DR25 KOI Table", 0.0664, 8.75209691, 0.509, 9.76], ["Holczer et al. 2016", None, 8.75208271, 0.566709, None], ["Q1-Q16 KOI Table", 0.0669, 8.75210645, 0.52, 9.65], ["Ofir et al. 2025", None, 8.752097, 0.509, None], ["Berger et al. 2018", None, None, None, 12.993], ["Dressing & Charbonneau 2015", None, 8.75208025, 0.566709, 9.7], ["Morton et al. 2016", None, 8.75210645, 0.57, None], ["Fabrycky et al. 2012", 0.09, 8.7522, 0.58, None], ["Swift et al. 2013", 0.067, 8.7522, 0.54, None]]},
    {"planet": "TOI-2285 b", "a": 0.1363, "a_ref": "Fukui et al. 2022", "P": 13.635109, "P_ref": "Fukui 2025", "Ms": 0.454, "Ms_ref": "Fukui et al. 2022", "papers": [["ExoFOP", None, 27.2672015846, None, 1.6051], ["Fukui 2025", None, 13.635109, 0.454, 3.91], ["Fukui et al. 2022", 0.1363, 27.26955, 0.454, 1.54]]},
    {"planet": "K2-417 b", "a": 0.063, "a_ref": "Incha et al. 2023", "P": 6.535, "P_ref": "Incha et al. 2023", "Ms": 0.569, "Ms_ref": "Incha et al. 2023", "papers": [["Incha et al. 2023", 0.063, 6.535, 0.569, None]]},
    {"planet": "Kepler-1319 b", "a": 0.0296, "a_ref": "Q1-Q17 DR25 KOI Table", "P": 2.886762645, "P_ref": "Morton et al. 2016", "Ms": 0.56, "Ms_ref": "Morton et al. 2016", "papers": [["Q1-Q16 KOI Table", 0.0256, 2.886762645, 0.267, 12.91], ["Q1-Q17 DR25 Supplemental KOI Table", None, 2.8867624, 0.498257, None], ["Gaidos et al. 2024", None, 2.89, None, None], ["Q1-Q17 DR24 KOI Table", 0.0256, 2.886762645, 0.267, 12.91], ["Mann et al. 2017", None, 2.88676239, 0.557, None], ["Q1-Q8 KOI Table", 0.024, 2.8867627, 0.21, None], ["Morton et al. 2016", None, 2.886762645, 0.56, None], ["Berger et al. 2018", None, None, None, 38.452], ["Q1-Q12 KOI Table", 0.0256, 2.886762645, 0.267, 12.91], ["Holczer et al. 2016", None, 2.88676368, 0.498257, None], ["Gajdoš et al. 2019", None, 2.8867601176, 0.498257, None], ["Q1-Q17 DR25 KOI Table", 0.0296, 2.8867624, 0.415, 22.75]]},
    {"planet": "K2-288 B b", "a": 0.164, "a_ref": "Feinstein et al. 2019", "P": 31.393463, "P_ref": "Feinstein et al. 2019", "Ms": 0.33, "Ms_ref": "Feinstein et al. 2019", "papers": [["Feinstein et al. 2019", 0.164, 31.393463, 0.33, None], ["Kruse et al. 2019", None, 31.3888, None, None]]},
    {"planet": "Kepler-959 b", "a": 0.1633, "a_ref": "Q1-Q17 DR25 KOI Table", "P": 14.80074836, "P_ref": "Morton et al. 2016", "Ms": 1.6, "Ms_ref": "Morton et al. 2016", "papers": [["Q1-Q17 DR24 KOI Table", 0.1324, 14.80074836, 1.409, 271.17], ["Q1-Q17 DR25 KOI Table", 0.1633, 14.80075082, 2.646, 3158.09], ["Q1-Q12 KOI Table", 0.1324, 14.80074836, 1.409, 271.17], ["Q1-Q16 KOI Table", 0.1324, 14.80074836, 1.409, 271.17], ["Q1-Q8 KOI Table", 0.132, 14.80012, 1.39, None], ["Berger et al. 2018", None, None, None, 165.868], ["Q1-Q17 DR25 Supplemental KOI Table", None, 14.80075082, 1.48, None], ["Gajdoš et al. 2019", None, 14.8008152979, 1.48, None], ["Morton et al. 2016", None, 14.80074836, 1.6, None], ["Holczer et al. 2016", None, 14.80058555, 1.48, None]]},
    {"planet": "Kepler-394 c", "a": 0.11, "a_ref": "Rowe et al. 2014", "P": 12.130686, "P_ref": "Rowe et al. 2014", "Ms": 0.87, "Ms_ref": "Fulton & Petigura 2018", "papers": [["Q1-Q17 DR24 KOI Table", 0.1082, 12.13065293, 1.145, 173.59], ["Q1-Q17 DR25 Supplemental KOI Table", None, 12.13070414, 1.1, None], ["Q1-Q17 DR25 KOI Table", 0.108, 12.13070414, 1.141, 155.85], ["Fulton & Petigura 2018", 0.09869, 12.13065293, 0.87, 107.9], ["Q1-Q8 KOI Table", 0.109, 12.13123, 1.17, None], ["Q1-Q16 KOI Table", 0.1082, 12.13065293, 1.145, 173.59], ["Morton et al. 2016", None, 12.13065293, 1.13, None], ["Gajdoš et al. 2019", None, 12.1310954255, 1.1, None], ["Q1-Q12 KOI Table", 0.1082, 12.13065293, 1.145, 173.59], ["Berger et al. 2018", None, None, None, 94.528], ["Rowe et al. 2014", 0.11, 12.130686, None, None]]},
    {"planet": "TrES-2 b", "a": 0.03568, "a_ref": "Fulton & Petigura 2018", "P": 2.47063, "P_ref": "Stassun et al. 2017", "Ms": 1.36, "Ms_ref": "Stassun et al. 2017", "papers": [["Q1-Q16 KOI Table", 0.035, 2.470613385, 0.94, 772.22], ["Q1-Q17 DR24 KOI Table", 0.035, 2.470613385, 0.94, 772.22], ["Q1-Q17 DR25 KOI Table", 0.0354, 2.470613377, 0.971, 761.46], ["Q1-Q17 DR25 Supplemental KOI Table", None, 2.470613377, 1.057, None], ["Holman et al. 2007", None, 2.470621, 0.98, None], ["Torres et al. 2008", 0.03558, 2.47063, 0.983, None], ["Christiansen et al. 2011", None, 2.47061344, 0.98, None], ["Southworth 2010", 0.03635, 2.4706101, 1.049, None], ["Southworth 2011", 0.03567, 2.47061323, 0.991, None], ["Esteves et al. 2015", 0.0367, 2.47061317, 0.98, None], ["Barclay et al. 2012", 0.03503, 2.4706132, 0.94, None], ["Schröter et al. 2012", None, 2.470613402, 1.057, None], ["Q1-Q8 KOI Table", 0.036, 2.47061317, 0.995, None], ["Q1-Q12 KOI Table", 0.035, 2.470613385, 0.94, 772.22], ["Kipping & Bakos 2011", 0.03563, 2.47061892, 0.99, None], ["Raetz et al. 2014", 0.03555, 2.4706133738, None, None], ["Stassun et al. 2017", None, 2.47063, 1.36, None], ["Öztürk & Erdem 2019", None, 2.47061437, 1.049, None], ["Kokori et al. 2022", None, 2.47061373, 0.983, None], ["ExoFOP", None, 2.470611418, None, 817.5658], ["Ivshina & Winn 2022", None, 2.470613501, None, None], ["Kokori et al. 2023", None, 2.470613372, 0.983, None], ["Fulton & Petigura 2018", 0.03568, 2.470613385, 0.991, 882.1], ["Winn et al. 2008", None, 2.470621, 0.98, None], ["Turner et al. 2016", 0.0367, 2.4706132, None, None], ["Berger et al. 2018", None, None, None, 903.864], ["Knutson et al. 2014", None, None, 0.94, None], ["O'Donovan et al. 2006", 0.0367, 2.47063, 1.08, None], ["Daemgen et al. 2009", 0.03556, 2.47063, 1.057, None], ["Sozzetti et al. 2007", None, None, 0.98, None], ["Bonomo et al. 2017", 0.03557, 2.470613374, 0.983, None], ["Rabus et al. 2009", None, 2.4706101, 1.057, None], ["Morton et al. 2016", None, 2.470613385, 0.99, None], ["Holczer et al. 2016", None, 2.47061338, 1.057, None]]},
    {"planet": "Kepler-1586 b", "a": 0.12208, "a_ref": "Fulton & Petigura 2018", "P": 15.6049212, "P_ref": "Morton et al. 2016", "Ms": 1.45, "Ms_ref": "Morton et al. 2016", "papers": [["Q1-Q17 DR25 KOI Table", 0.1266, 15.604841, 1.11, 248.62], ["Q1-Q17 DR25 Supplemental KOI Table", None, 15.604841, 1.186, None], ["Berger et al. 2018", None, None, None, 105.771], ["Gajdoš et al. 2019", None, 15.6048141194, 1.186, None], ["Q1-Q12 KOI Table", 0.13, 15.6049212, 1.201, 357.25], ["Morton et al. 2016", None, 15.6049212, 1.45, None], ["Q1-Q17 DR24 KOI Table", 0.13, 15.6049212, 1.201, 357.25], ["Fulton & Petigura 2018", 0.12208, 15.6049212, 0.995, 110.6], ["Q1-Q16 KOI Table", 0.13, 15.6049212, 1.201, 357.25]]},
    {"planet": "HD 77338 b", "a": 0.06, "a_ref": "Stassun et al. 2017", "P": 5.7361, "P_ref": "Stassun et al. 2017", "Ms": 1.37, "Ms_ref": "Stassun et al. 2017", "papers": [["Jenkins et al. 2013", 0.0614, 5.7361, 0.93, None], ["Stassun et al. 2017", 0.06, 5.7361, 1.37, None]]},
    {"planet": "Kepler-1252 b", "a": 0.1078, "a_ref": "Q1-Q17 DR25 KOI Table", "P": 15.0540329, "P_ref": "Morton et al. 2016", "Ms": 1.06, "Ms_ref": "Morton et al. 2016", "papers": [["Q1-Q12 KOI Table", 0.1078, 15.0540329, 0.734, 46.3], ["Morton et al. 2016", None, 15.0540329, 1.06, None], ["Gajdoš et al. 2019", None, 15.0537400445, 1.0, None], ["Q1-Q17 DR25 Supplemental KOI Table", None, 15.0539886, 1.0, None], ["Q1-Q17 DR25 KOI Table", 0.1078, 15.0539886, 0.734, 46.3], ["Q1-Q17 DR24 KOI Table", 0.1078, 15.0540329, 0.734, 46.3], ["Q1-Q16 KOI Table", 0.1078, 15.0540329, 0.734, 46.3], ["Berger et al. 2018", None, None, None, 57.579], ["Q1-Q8 KOI Table", 0.113, 15.05417, 0.845, None]]},
    {"planet": "EPIC 201841433 b", "a": 0.035, "a_ref": "del Ser & Fors 2020", "P": 4.1698, "P_ref": "del Ser & Fors 2020", "Ms": 0.802, "Ms_ref": "del Ser & Fors 2020", "papers": [["del Ser & Fors 2020", 0.035, 4.1698, 0.802, None], ["Heller et al. 2019", None, 4.16959, 0.802, None], ["Kruse et al. 2019", None, 4.16888, None, None]]},
    {"planet": "K2-11 b", "a": 0.2257, "a_ref": "Montet et al. 2015", "P": 39.93767, "P_ref": "Montet et al. 2015", "Ms": 1.35, "Ms_ref": "Montet et al. 2015", "papers": [["Montet et al. 2015", 0.2257, 39.93767, 1.35, None], ["Vanderburg et al. 2016", None, 39.863566, None, None], ["Crossfield et al. 2016", 0.2196, 39.8478, 0.89, 9.84], ["Kruse et al. 2019", None, 39.8642, None, None]]},
    {"planet": "HD 63454 b", "a": 0.04, "a_ref": "Stassun et al. 2017", "P": 2.81805, "P_ref": "Stassun et al. 2017", "Ms": 0.42, "Ms_ref": "Stassun et al. 2017", "papers": [["Kane et al. 2011", 0.0368, 2.818049, 0.84, None], ["Moutou et al. 2005", 0.036, 2.817822, 0.8, None], ["Stassun et al. 2017", 0.04, 2.81805, 0.42, None]]},
    {"planet": "TOI-892 b", "a": 0.092, "a_ref": "Brahm et al. 2020", "P": 10.62656, "P_ref": "Brahm et al. 2020", "Ms": 1.28, "Ms_ref": "Brahm et al. 2020", "papers": [["Knudstrup et al. 2024", None, 10.62656, 1.28, None], ["ExoFOP", None, 10.6265837, None, 571.007], ["Patel & Espinoza 2022", None, 10.626562, 1.28, None], ["Kokori et al. 2023", None, 10.626628, 1.28, None], ["Brahm et al. 2020", 0.092, 10.62656, 1.28, None]]},
    {"planet": "HIP 41378 e", "a": 0.68, "a_ref": "Lund et al. 2019", "P": 393.0, "P_ref": "Grouffal et al. 2026", "Ms": 1.22, "Ms_ref": "Lund et al. 2019", "papers": [["Vanderburg et al. 2016", None, 131.0, 1.15, None], ["Grouffal et al. 2026", None, 393.0, 1.22, None], ["Howard et al. 2025", None, 369.0, 1.16, 2.1], ["Berardo et al. 2019", None, None, 1.168, None], ["Lund et al. 2019", 0.68, 260.0, 1.22, None]]},
    {"planet": "HD 116029 b", "a": 1.65, "a_ref": "Stassun et al. 2017", "P": 670.0, "P_ref": "Stassun et al. 2017", "Ms": 0.83, "Ms_ref": "Stassun et al. 2017", "papers": [["Stassun et al. 2017", 1.65, 670.0, 0.83, None], ["Johnson et al. 2011", 1.78, 670.0, 1.58, None]]},
    {"planet": "OGLE2-TR-L9 b", "a": 0.0308, "a_ref": "Snellen et al. 2009", "P": 2.4855335, "P_ref": "Snellen et al. 2009", "Ms": 1.52, "Ms_ref": "Snellen et al. 2009", "papers": [["Southworth 2010", 0.0404, 2.485533, 1.42, None], ["ExoFOP", None, 2.48554277506, None, 4135.4482], ["Southworth 2012", 0.04047, 2.48553417, 1.427, None], ["Snellen et al. 2009", 0.0308, 2.4855335, 1.52, None]]},
    {"planet": "HD 215497 b", "a": 0.05, "a_ref": "Stassun et al. 2017", "P": 3.93404, "P_ref": "Stassun et al. 2017", "Ms": 0.67, "Ms_ref": "Stassun et al. 2017", "papers": [["Lo Curto et al. 2010", 0.047, 3.93404, 0.872, None], ["Kiefer et al. 2021", None, 3.934, None, None], ["Stassun et al. 2017", 0.05, 3.93404, 0.67, None]]},
    {"planet": "K2-275 b", "a": 0.0277, "a_ref": "Castro-González et al. 2022", "P": 3.2809626, "P_ref": "Castro-González et al. 2022", "Ms": 0.77, "Ms_ref": "Castro-González et al. 2022", "papers": [["Pope et al. 2016", None, 3.281, 0.772, None], ["Barros et al. 2016", None, 3.28046294, 0.772, None], ["Mayo et al. 2018", None, 3.280858, None, None], ["Livingston et al. 2018", 0.04, 3.280961, 0.79, None], ["Castro-González et al. 2022", 0.0277, 3.2809626, 0.77, None], ["Petigura et al. 2018", None, 3.280926, None, None], ["ExoFOP", None, 3.28102986099, None, 161.2476], ["Kruse et al. 2019", None, 3.280948, None, None]]},
    {"planet": "MXB 1658-298 b", "a": 1.613, "a_ref": "Jain et al. 2017", "P": 760.0, "P_ref": "Jain et al. 2017", "Ms": 1.98, "Ms_ref": "Lewin & Joss 1981", "papers": [["Jain et al. 2017", 1.613, 760.0, None, None]]},
    {"planet": "Kepler-410 A b", "a": 0.1226, "a_ref": "Van Eylen et al. 2014", "P": 17.833648, "P_ref": "Van Eylen et al. 2014", "Ms": 1.214, "Ms_ref": "Van Eylen et al. 2014", "papers": [["Gajdoš et al. 2017", 0.1226, 17.8336313, 1.238, None], ["Q1-Q17 DR25 KOI Table", 0.1424, 17.83367834, 1.208, 132.94], ["Holczer et al. 2016", None, 17.83365704, 1.238, None], ["Q1-Q16 KOI Table", 0.1436, 17.83368211, 1.242, 128.66], ["Q1-Q17 DR24 KOI Table", 0.1436, 17.83368211, 1.242, 128.66], ["Van Eylen et al. 2014", 0.1226, 17.833648, 1.214, None], ["Q1-Q8 KOI Table", 0.141, 17.834381, 1.17, None], ["ExoFOP", None, 17.8335899, None, 62.1044], ["Morton et al. 2016", None, 17.83368211, 1.22, None], ["Berger et al. 2018", None, None, None, 159.5], ["Q1-Q12 KOI Table", 0.1436, 17.83368211, 1.242, 128.66], ["Q1-Q17 DR25 Supplemental KOI Table", None, 17.83367834, 1.238, None]]},
    {"planet": "Kepler-1649 c", "a": 0.0649, "a_ref": "Q1-Q17 DR25 KOI Table", "P": 19.53527, "P_ref": "Vanderburg et al. 2020", "Ms": 0.1977, "Ms_ref": "Vanderburg et al. 2020", "papers": [["Q1-Q17 DR25 KOI Table", 0.0649, 19.5352551, 0.096, 0.16], ["Q1-Q17 DR25 Supplemental KOI Table", None, 19.5352551, 0.200732, None], ["Vanderburg et al. 2020", None, 19.53527, 0.1977, 0.75]]},
    {"planet": "Kepler-1646 b", "a": 0.0295, "a_ref": "Q1-Q17 DR25 KOI Table", "P": 4.48558383, "P_ref": "Morton et al. 2016", "Ms": 0.24, "Ms_ref": "Morton et al. 2016", "papers": [["Gaidos et al. 2024", None, 4.49, None, None], ["Morton et al. 2016", None, 4.48558383, 0.24, None], ["Gajdoš et al. 2019", None, 4.4855629633, 0.361077, None], ["Berger et al. 2018", None, None, None, 15.637], ["Q1-Q17 DR24 KOI Table", 0.0299, 4.48558383, 0.176, 4.34], ["Q1-Q17 DR25 KOI Table", 0.0295, 4.48559215, 0.169, 4.2], ["Q1-Q17 DR25 Supplemental KOI Table", None, 4.48559215, 0.361077, None]]},
    {"planet": "HD 28109 b", "a": 0.1357, "a_ref": "Dransfield et al. 2022", "P": 22.891054, "P_ref": "Barone et al. 2025", "Ms": 1.227, "Ms_ref": "Barone et al. 2025", "papers": [["Dransfield et al. 2022", 0.1357, 22.89104, 1.26, None], ["Barone et al. 2025", None, 22.891054, 1.227, None], ["ExoFOP", None, 22.8909897176, None, 33.4501]]},
]

def num(v):
    return None if v is None or v == '' else float(v)


def load(folder):
    d = json.load(open(os.path.join(folder, 'pscomppars-snapshot.json'), encoding='utf-8'))
    I = {c: i for i, c in enumerate(d['cols'])}
    out = []
    for r in d['rows']:
        lim = {p.split(':')[0] for p in str(r[I['lim']] or '').split(';') if ':' in p and float(p.split(':')[1] or 0)}
        v = lambda c: None if c in lim else num(r[I[c]])
        prov = d['massprov'][r[I['massprov']]] if r[I['massprov']] is not None else None
        Mp = v('pl_bmasse') if prov in TRUE_MASS and not r[I['pl_bmasselim']] else None
        out.append({'name': r[I['pl_name']], 'a': v('pl_orbsmax'), 'P': v('pl_orbper'), 'Ms': v('st_mass'), 'Mp': Mp, 'S': v('pl_insol'),
                    'Teff': v('st_teff'), 'Rs': v('st_rad'), 'logL': v('st_lum')})
    return out


def kepler(P, Ms, Mp=None):
    return ((P / 365.25) ** 2 * (Ms + (Mp or 0) * M_EARTH_IN_SUN)) ** (1 / 3) if P and Ms and P > 0 and Ms > 0 else None


def flux(Teff, Rs, a):
    return Rs * Rs / (a * a) * (Teff / 5772) ** 4 if Teff and Rs and a and Teff > 0 and Rs > 0 and a > 0 else None


def seff(teff, c):
    T = min(max(teff, KOPPARAPU['tRange'][0]), KOPPARAPU['tRange'][1]) - 5780
    return c[0] + c[1] * T + c[2] * T ** 2 + c[3] * T ** 3 + c[4] * T ** 4


def zone(teff, S):
    if not teff or not S or S <= 0:
        return 'unknown'
    e = {k: seff(teff, KOPPARAPU[k]) for k in ('runaway', 'maxGreen', 'recentVenus', 'earlyMars')}
    if e['maxGreen'] <= S <= e['runaway']:
        return 'cons'
    if e['earlyMars'] <= S <= e['recentVenus']:
        return 'opt'
    return 'hot' if S > e['recentVenus'] else 'cold'


def lum(p):
    if p['Rs'] and p['Teff'] and p['Rs'] > 0 and p['Teff'] > 0:
        return p['Rs'] ** 2 * (p['Teff'] / 5772) ** 4
    return 10 ** p['logL'] if p['logL'] is not None else None


def starlight(p, a):
    """The page's rule (starlight.js) at point values: from the star with the orbit given, else the archive's
    insolation, else the luminosity over the orbit."""
    s = flux(p['Teff'], p['Rs'], a)
    if s:
        return s
    if p['S'] and p['S'] > 0:
        return p['S']
    L = lum(p)
    return L / (a * a) if L and a else None


def main_starlight(p):
    """main before ticket 2.14 (science.js insolation): the archive's insolation; else the archive's luminosity, or
    R^2 (Teff / 5772 K)^4, over the archive's orbit, else Kepler's law from the star's mass alone."""
    if p['S'] is not None:
        return p['S']
    L = 10 ** p['logL'] if p['logL'] is not None else lum(p)
    a = p['a'] if p['a'] else kepler(p['P'], p['Ms'])
    return L / (a * a) if L and a else None


def report(planets):
    both = [p for p in planets if p['a'] and kepler(p['P'], p['Ms'], p['Mp'])]
    off = lambda p: abs(kepler(p['P'], p['Ms'], p['Mp']) - p['a']) / p['a']
    print(f"Planets with an archive orbit, a period and a star's mass: {len(both)} of {len(planets)}")
    for t in (0.05, 0.10, 0.20):
        n = sum(off(p) <= t for p in both)
        print(f"  Kepler's law within {int(t * 100)}% of the archive's orbit: {n} ({len(both) - n} off by more)")
    choices = {'archive orbit': lambda p: p['a'] or kepler(p['P'], p['Ms'], p['Mp']),
               "Kepler's law": lambda p: kepler(p['P'], p['Ms'], p['Mp']) or p['a']}
    print("\nStarlight against the archive's insolation, and zones against main (point values):")
    for name, orbit in choices.items():
        pairs = [(flux(p['Teff'], p['Rs'], orbit(p)), p['S']) for p in planets if p['S'] and p['S'] > 0]
        pairs = [(s, a) for s, a in pairs if s]
        far = sum(max(s / a, a / s) > 1.2 for s, a in pairs)
        moved = sum(zone(p['Teff'], starlight(p, orbit(p))) != zone(p['Teff'], main_starlight(p)) for p in planets)
        print(f"  {name:14}: more than 1.2 times off the archive's insolation for {far} of {len(pairs)}; {moved} planets change zone")
    return off


def kep_of(row):
    return kepler(row[2], row[3])


def votes(entry, teff, rs):
    """The votes of the papers on one planet, by the rule in the docstring."""
    A, K = entry['a'], kepler(entry['P'], entry['Ms'], entry.get('Mp'))
    SA, SK = flux(teff, rs, A), flux(teff, rs, K)
    out = {'archive': [], 'kepler': []}
    for ref, a, P, Ms, S in entry['papers']:
        if ref == entry['a_ref'] or not P or not Ms or abs(P / entry['P'] - 1) >= 0.05 or abs(Ms / entry['Ms'] - 1) >= 0.10:
            continue
        for what, val, xa, xk, tol in (('a', a, A, K, 0.05), ('S', S, SA, SK, 0.20)):
            if not val or not xa or not xk:
                continue
            da, dk = abs(val / xa - 1), abs(val / xk - 1)
            side = 'archive' if da <= tol and da < dk else 'kepler' if dk <= tol and dk < da else None
            if side:
                out[side].append(f"{ref} {what} {val:g}")
    return out


def company(entry, K):
    """For a planet the votes leave undecided: which of the two orbits another paper states (within 5%), whatever star
    that paper used. A paper on another star's mass, or one restating the archive's source, is company, not a vote."""
    A, out = entry['a'], set()
    for ref, a, P, Ms, S in entry['papers']:
        if ref == entry['a_ref'] or not a:
            continue
        if abs(a / A - 1) <= 0.05:
            out.add('archive')
        if abs(a / K - 1) <= 0.05:
            out.add('kepler')
    return out


def main(folder):
    planets = load(folder)
    by = {p['name']: p for p in planets}
    off = report(planets)
    print(f"\nThe papers ({len(SAMPLE)} planets, every one off Kepler's law by more than 10% in the snapshot):")
    tally, near = {'archive': 0, 'kepler': 0, 'none': 0}, {'archive': [], 'kepler': []}
    for e in SAMPLE:
        p = by[e['planet']]
        assert off(p) > 0.10, e['planet']
        v = votes({**e, 'Mp': p['Mp']}, p['Teff'], p['Rs'])
        side = 'kepler' if len(v['kepler']) > len(v['archive']) else 'archive' if len(v['archive']) > len(v['kepler']) else 'none'
        tally[side] += 1
        if side == 'none':
            for k in company(e, kepler(e['P'], e['Ms'], p['Mp'])):
                near[k].append(e['planet'])
        said = '; '.join([f'Kepler: {x}' for x in v['kepler']] + [f'archive: {x}' for x in v['archive']]) or 'no paper on the same star and orbit states either'
        print(f"  {e['planet']:18} archive {e['a']:.4g} AU ({e['a_ref']}), Kepler {kepler(e['P'], e['Ms'], p['Mp']):.4g} AU (P: {e['P_ref']}; star: {e['Ms_ref']}) -> {side}: {said}")
    print(f"\nPlanets whose papers decide: {tally['kepler']} for Kepler's law, {tally['archive']} for the archive's orbit; {tally['none']} undecided.")
    for k, label in (('archive', "the archive's orbit"), ('kepler', "Kepler's")):
        print(f"Undecided planets where another paper, on another star's mass, states {label}: {len(near[k])} ({', '.join(near[k]) or 'none'}).")
    if tally['kepler'] > tally['archive']:
        print("Verdict: Kepler's third law wherever the period and the star's mass exist; the archive's orbit only where one is missing.")
    elif tally['archive'] > tally['kepler']:
        print("Verdict: the archive's orbit; Kepler's law only where it has none.")
    else:
        print('Verdict: none; the papers do not decide.')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
