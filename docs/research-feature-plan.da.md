BoligData — featureplan for boligresearch før fremvisning
Dato: 26. september 2026
Leverance: Produktforslag, datakrav, prioriteret backlog og acceptkriterier. Ingen kode eller produktionsdata er ændret.
0. Grundlag og undersøgelsens begrænsning
Repoets README på main kunne læses. Hentning af de enkelte kildefiler og en lokal kloning lykkedes ikke, og produktionen/database er ikke afprøvet. Dette er derfor en dokumentationsbaseret kortlægning og produktplan, ikke en fuld kodeaudit. Commit-id kunne ikke verificeres. Før implementering skal forslagene afstemmes med den aktuelle kode og schema.
Dokumentationen beskriver boligopslag, registeropslag, salgshistorik, screening, sammenligninger og samarbejdsfunktioner. Byg videre på det grundlag. Omtale af en integration er ikke dokumentation for, at alle dens data fungerer i produktion. [R1]
Projektinstruktionerne fastlægger familiens seneste krav: to voksne, to børn, minimum 130 m² bolig, tre lovligt anvendelige soveværelser og 5.000.000 kr. til det samlede projekt. Ældre beregninger med 5 mio. kr. alene til køb er forældede. [P1]
1. Produktets mål
Hjælp køberen med at afgøre, om en bolig er værd at se, hvilket prisniveau der kan hænge sammen, hvilke forhold der mangler dokumentation, og hvad mægleren skal spørges om.

BoligData skal understøtte forberedelsen før en fremvisning. Det er ikke et værktøj, som automatisk fastslår markedsværdi, teknisk stand, juridisk lovlighed eller sælgers mindstepris.
Det centrale forløb:
Adresse/annoncelink → boligundersøgelse → krav og budget → historik og sammenligninger → afklaringer → mæglerudkast → fremvisningsbeslutning
Vis fire mulige næste skridt:
- Relevant til fremvisning: kendte krav passer, og den valgte økonomi hænger sammen.
- Afklar pris først: relevant bolig, men det nødvendige prisniveau skal drøftes.
- Afklar dokumentation først: afgørende forhold er ukendte eller modstridende.
- Fravalgt: et kendt ufravigeligt krav er ikke opfyldt.
Et positivt prisresultat må ikke ophæve et kendt problem med boligtype, støj, rådighed eller areal. Ukendt dokumentation må ikke give et grønt godkendelsesstempel.
2. Prioriteret leveranceplan
Trin	Leverance	Hvilket spørgsmål løser den?	Afhængighed
0	Dataimport, historik og kildestatus	Kan tallene sammenlignes og efterprøves?	Afklaring af nuværende schema og datakilder
1	Boligundersøgelse, projektbudget og enkel prisanalyse	Er denne bolig overhovedet relevant før en fremvisning?	Trin 0
2	Interaktiv statistik og valgbare sammenlignelige salg	Hvilke handler underbygger prisreferencen?	Normaliserede handler og udbudsforløb
3	Renoveringstekster, dokumentationsarbejde og mæglerpakke	Hvad ved vi, hvad mangler, og hvad skal vi spørge om?	Evidens- og budgetmodel
4	Områdeoplysninger, ændringsvarsler og mere avancerede modeller	Hvad ændrer beslutningsgrundlaget over tid?	Stabil dækning og de første brugerforløb


Trin 1 skal være et anvendeligt lodret udsnit, ikke kun backend-arbejde: én bolig, ét budget, én historisk reference, ét kildespor og én brugbar næste handling.
Del A — Brugerfunktioner
F01. Projektprofil med hårde krav og præferencer
Formål: Undgå at generiske søgefiltre eller en høj totalscore præsenterer boliger som relevante, selv om de ikke passer.
Opret en privat projektprofil med:
- Samlet projektloft, ikke kun maksimal udbudspris.
- Mindste boligareal og krævede soveværelser.
- Godtagne boligtyper og primære/sekundære områder.
- Fravalgte adresser, veje og brugerdefinerede områder.
- To parallelle købsspor: indflytningsklart og renovering.
- Præferencer, der ikke er hårde krav, eksempelvis ekstra bad eller have.
- Valgfri månedlig økonomi, når finansieringsforudsætningerne er oplyst.
Familiens profil kan initialiseres med 5 mio. kr., 130 m² og tre soveværelser. Dette skal være data i brugerens projekt, ikke globale produktregler. Tidligere vejfravalg må gerne overføres som personlige fravalg, men ikke som offentlige påstande om støj.
Hvert kriterium har opfyldt / ikke opfyldt / ukendt og en begrundelse. Et budgetmatch kan yderligere være betinget af et valgt pris-/arbejdsscenario.
Accept:
- 116 m² bolig plus kælder opfylder ikke et krav på 130 m² bolig.
- Fire annoncerede rum beviser ikke tre brugbare soveværelser.
- En fordelagtig pris kan ikke kompensere for et ufravigeligt fravalg.
- Profilændring genberegner eksisterende kandidater uden at ændre historiske data.
F02. Én boligundersøgelse med et beslutningskort
Formål: Gøre boligdetaljen til det primære arbejdssted.
Øverst:
1. Familiekrav: opfyldt, ikke opfyldt eller ukendt.
2. Aktuel udbudspris og observationsdato.
3. Valgt samlet projektpris og afstand til projektloftet.
4. Statistisk reference med datagrundlag og tydelig usikkerhed.
5. Vigtigste åbne spørgsmål.
6. Anbefalet næste handling med begrundelse.
Foreslåede underfaner:
Overblik · Pris og historik · Sammenligninger · Projektbudget · Stand og dokumentation · Område · Mæglerdialog
Tilføj også et sammenligningsbord for 2–4 kandidater: lovligt bolig-/soveværelsesgrundlag, nødvendig købspris, samlet projektpris, nødvendigt afslag og væsentlige ubekendte.
Undgå en samlet “god handel: 87 %”-score. Vis i stedet separate vurderinger af egnethed, økonomi og dokumentation.
F03. Projektbudget og maksimal købspris
Formål: Besvare “hvad må netop vi betale?” uden at forveksle det med boligens markedsværdi.
Formel:
maksimal_købspris =
samlet_projektloft
− handels_og_finansieringsomkostninger
− arbejder
− øvrige_projektudgifter
− reserve
Poster skal kunne opdeles i:
- Nødvendige arbejder før indflytning.
- Ønskede forbedringer.
- Senere, udskudte arbejder.
- Rådgivning og myndighedsarbejde.
- Genhusning, flytning, dobbelt boligudgift og projektfinansiering.
- Reserve uden dobbeltregning af en buffer, der allerede er indeholdt i et tilbud.
Hver post får beløb eller interval, momsstatus, kilde, dato og status: brugerantagelse, overslag eller konkret tilbud. Ukendte nødvendige arbejder er ikke automatisk 0 kr.
Vis basis- og belastningsscenario. Summen af lave/høje overslag er et scenariointerval, ikke et statistisk konfidensinterval.
Regnefixture:
5.000.000 − 150.000 − 650.000 − 200.000 = 4.000.000 kr. til køb.
Beløbene til omkostninger, arbejder og reserve er illustrative antagelser. De må ikke sættes som universelle takster.
Accept: En ejendom til 4,9 mio. kr. er ikke “inden for budget”, hvis projektets kendte øvrige poster bringer summen over 5 mio. kr.
F04. Prisforløb med adskilte liggetider
Formål: Undgå de definitionsfejl, der tidligere påvirkede Excel-referencerne.
Vis en tidslinje med:
- Første dokumenterede udbud i det relevante salgsforløb.
- Prisændringer med dato og kilde.
- Mæglerskifte, pause, genudbud og fjernelse.
- Seneste udbudspris før en dokumenteret handel.
- Salgspris og handelstype, når de er dokumenteret.
Opbevar mindst tre tidsmål:
1. Seneste udbudsperiode: kildens præcise definition bevares.
2. Samlet dokumenteret aktiv liggetid: summering af forenede aktive intervaller, uden dobbeltregning af samtidige annoncer og uden pauser.
3. Kalendertid siden første dokumenterede udbud: kan indeholde pauser.
Botens first_seen_at er et fjerde, teknisk observationsfelt og må aldrig automatisk blive boligens første udbudsdato.
Forskellige kildetal gemmes side om side med valgt fortolkning. Månedskendte datoer gemmes med månedlig præcision eller et interval, ikke en opdigtet præcis dag.
Accept:
- 447 samlede dage og 91 dage hos seneste mægler må ikke blive til samme tal.
- En fjernet annonce er ikke automatisk en solgt bolig.
- Et ufuldstændigt crawl må ikke klassificere alle ikke-genfundne annoncer som fjernede.
- Manglende udbudshistorik er ikke dokumentation for 0 dage eller skuffesalg.
F05. Prisdialog: nødvendig pris kontra historisk afslag
Formål: Give et gennemskueligt prisgrundlag før kontakt til mægleren.
Vis fire separate størrelser:
- Dagens udbud.
- Historiske referencepriser beregnet på et valgt sammenligningsgrundlag.
- Brugerens maksimale købspris efter projektposter.
- Brugerens valgte prisniveau til den indledende dialog.
Beregn:
allerede_nedsat = (første_udbud − aktuelt_udbud) / første_udbud
nødvendigt_yderligere_afslag = (aktuelt_udbud − målpris) / aktuelt_udbud
nødvendigt_samlet_fald = (første_udbud − målpris) / første_udbud

historisk_samlet_fald = (første_udbud − salgspris) / første_udbud
historisk_sidste_afslag = (sidste_udbud_før_salg − salgspris) / sidste_udbud_før_salg
Hvis et “nødvendigt afslag” er negativt, vis i brugerfladen, at intet afslag kræves for det valgte budget. Bevar rå signed værdier, hvor det giver analytisk mening. Negative historiske afslag skal altid bevares.
En sammenligningsgruppe må kun anvendes med dens korrekte pris- og tidsdefinition.
Regneeksempel, ikke aktuel annonce:
- Første udbud: 4.600.000 kr.
- Aktuelt udbud: 4.300.000 kr.
- Seneste udbudsperiode: 240 dage.
- Maksimal købspris fra projektbudgettet: 4.000.000 kr.
- Allerede reduceret: 6,52 %.
- Nødvendigt ekstra afslag: 300.000 kr. / 6,98 %.
- Nødvendigt samlet fald: 13,04 %.
Den tidligere samlede gruppe på 181–365 dage havde 44 handler og ca. 13 % medianfald. Med den afrundede median giver første udbud × 0,87 ca. 4,0 mio. kr. [P1]
Korrekt tekst: “Dit prisniveau svarer omtrent til medianfaldet i denne historiske gruppe. Gruppen er ikke nødvendigvis matchet på stand og størrelse.”
Forkert tekst: “Der er 50 % sandsynlighed for, at sælger accepterer 4 mio. kr.”
Hvis kun dagens udbud kendes, kan totalfald fra første udbud ikke bruges som automatisk yderligere rabat. Brug dokumenterede sidste-pris-afslag eller vis utilstrækkeligt grundlag.
Q1, median og Q3 kan vises som historiske fordelingspunkter. Det er ikke et konfidensinterval for ejendommens værdi.
Udvælgelse af annoncer:
scenario_første_udbudsloft = maksimalt_købsbudget / (1 − valgt_totalfald).
Navngiv det “udbudsloft i valgt scenario”, ikke “maksimal rimelig markedspris”.
F06. Statistik, som kan undersøges til bunds
Formål: Gøre hvert nøgletal efterprøvbart på web.
Filtre:
- Område: kommune, postnummer, gade, kortudsnit eller selvtegnet polygon.
- Boligtype og arealdefinition.
- Boligareal og dokumentationsstatus.
- Salgspris og oprindelig udbudspris.
- Salgsperiode, år, måned og sæson.
- Liggetid og valgt tidsdefinition.
- Standssignaler, dødsbo som separat felt og tekstens periodetilknytning.
- Handelstype og datakvalitet.
De fem oprindelige liggetidsgrupper genbruges: 0–30, 31–90, 91–180, 181–365 og over 365 dage.
Vis:
- Median, gennemsnit, Q1/Q3 og observationstal.
- Antal ejendomme samt antal handler, når flere salg på samme ejendom findes.
- Antal uden første pris, sidste pris, areal, tekst eller gyldig liggetid.
- Andel af det valgte udvalg, der faktisk indgår i hvert mål.
- Beregningsdato, dataversion, filtre og udelukkelsesgrunde.
Klik på et interval åbner handlerne bag tallet. Klik på en handel åbner dens udbudsforløb og kilder. Udvælgelse i en graf skal filtrere tabel og kort i samme analyse.
Foreslåede grafer:
- Punkter: liggetid mod samlet prisfald.
- Fordeling pr. tidsinterval.
- Salgspris pr. bolig-m² mod areal, med valgt bolig fremhævet.
- År × måned med særskilt visning af antal handler.
- Udvikling for lokalt udvalg ved siden af kommunereference, ikke sammenblandet.
To adskilte populationer: Afsluttede handler og aktuelt usolgte boliger. De usolgte har en igangværende observationstid; deres slutpris og samlede salgstid kendes ikke. En senere overlevelsesmodel kan håndtere det, men første version skal blot holde dem tydeligt adskilt.
Små grupper giver fremtrædende advarsler. Vis ikke en “sikker renoveringsrabat” på én brugbar reference.
F07. Sammenlignelige handler som brugerens arbejdsudvalg
Formål: Erstatte “nærmest” med “mest relevant og forklarligt”.
Match først boligtype og enhedstype. Sammenlign derefter område, boligareal, grund, salgsdato, stand og relevante begrænsninger.
Vis for hver handel:
- Hvorfor den er foreslået.
- Forskelle fra boligen, eksempelvis nyere stand eller manglende standstekst.
- Om arealet gælder på salgstidspunktet eller er et senere registertal.
- Første/sidste udbud, salg, begge afslag og valgt liggetid.
- Kildestatus og eventuelle konflikter.
Brugeren kan medtage/udelukke en handel med begrundelse. Vis både det oprindelige systemudvalg og det brugerjusterede udvalg, så manuel udvælgelse ikke skjules.
Pris pr. m² skal have samme nævner i alle sammenlignede rækker. Kombiner ikke registerbaseret boligareal med et vægtet markedsareal uden tydelig separat opgørelse.
Der må ikke lægges yderligere “standsrabat” oven i en reference, som allerede består af boliger i tilsvarende stand, uden en konkret begrundelse.
F08. Stand og renovering: tekstspor, ikke automatisk diagnose
Formål: Finde relevante renoveringsreferencer og fjerne falske positiver.
Gem flere samtidige signaler:
- Fremtidigt renoveringsbehov.
- Oprindelig stand/modernisering.
- Svagt salgssprog: potentiale, eget præg.
- Allerede udførte arbejder.
- Indflytningsklar beskrivelse.
- Nedrivning/byggegrund.
- Dødsbo.
- Ukendt eller modstridende dokumentation.
Test bl.a.:
- “Kræver totalrenovering” → behov.
- “Totalrenoveret i 2023” → udført arbejde.
- “Ikke renoveret siden opførelsen” → må ikke blive udført renovering.
- “Nyt køkken, men taget skal udskiftes” → både udførte arbejder og behov.
- “Dødsbo” → separat oplysning, ikke automatisk dårlig stand eller salgspres.
- “Sæt eget præg” → svagt signal.
Familiens stramme renoveringsfilter udelukker opslag med udført renovering/indflytningsklar omtale fra det særlige analyseudvalg. Selve boligen og signalerne bevares, og boligen kan stadig være relevant i det indflytningsklare søgespor.
Klassifikation skal gemme tekstuddrag, kilde, annonceperiode, metode, versionsnummer og menneskelig godkendelse. Ny tekst fra et senere salg må ikke opdatere tidligere stand som et historisk faktum.
Et estimat af stand ud fra byggeår må ikke blive et automatisk beløb for renoveringsarbejde. Kombinér i stedet dokumenterede bygningsdele med brugerens eller fagpersonens overslag.
Dækning: Den hidtidige screening havde 37 handelsmatchende tekstfund; kun fire var tydeligt behov/original stand, og kun én af disse var mindst 130 m². Dette er en advarsel om datagrundlag, ikke et træningsgrundlag for en generel prisrabat. [P1]
F09. Kilder, konflikter og fremvisningspakke
Formål: Omsætte ukendte forhold til konkrete spørgsmål.
Hver oplysning skal kunne have:
værdi + kilde + gyldighedstidspunkt + observationstidspunkt + metode + kontrolstatus.
Adskil:
- Registerdata.
- Mæglerudsagn.
- Brugerobservation.
- Beregnet resultat.
- Maskinelt fortolket tekst.
- Fagligt eller manuelt verificeret dokumentation.
Vis “ukendt” særskilt fra “undersøgt, intet fundet”. Bevar modstridende tal uden at overskrive dem stiltiende.
En fremvisningspakke skal kunne eksporteres som en printvenlig side med:
- Familiens relevante krav.
- Budgetscenario og begrundelse for det valgte prisniveau.
- Prisforløb og 3–5 udvalgte sammenligninger.
- De vigtigste spørgsmål og ønskede dokumenter.
- Dato, kildestatus og egne noter.
Første version behøver ikke automatisk dokumentfortolkning. Start med upload/link, manuel klassifikation og side-/afsnitshenvisning. AI kan senere foreslå spørgsmål og tekstudtræk; den må ikke godkende byggeteknik eller jura.
F10. Mæglerdialog uden at afsløre alt
Generer et redigerbart udkast ud fra:
- Den konkrete interesse i boligen.
- Prisafstand og det valgte samtaleniveau.
- Liggetid med korrekt definition.
- Vigtige uafklarede forhold.
- Ønsket næste skridt.
Tilbyd første kontakt, prisafklaring før fremvisning, spørgsmål om genudbud og opfølgning. Brug de eksisterende intervalideer fra projektet, men lad ikke en daggrænse alene afgøre tonen. [P1]
Projektloft, maksimalt bud og reserve er private. Brugeren vælger aktivt, hvilke beløb et udkast indeholder. Hård maksimumpris og forhandlingstaktik må ikke automatisk deles med en mæglerkonto.
Der må aldrig tilføjes påstande om godkendt finansiering, hurtig overtagelse eller accepteret bud uden brugerens bekræftelse. Generering er ikke afsendelse.
F11. Område, hverdagsliv og særlige ejendomme
Byg separate lag for:
- Eksisterende trafikstøj og særskilt dokumentation for fremtidige anlæg.
- Skoledistrikt og indkøb; hold distriktsoplysninger adskilt fra subjektive skolevurderinger.
- Personlige fravalg og områdepræferencer.
- Relevante bygge-, plan- og jordforhold med kilde og dato.
Ukendt støj er ikke “stille”. En vej i brugerens fravalg er ikke nødvendigvis objektivt støjbelastet.
Flerfamiliehuse skal have et særskilt undersøgelsesspor: antal annoncerede/registrerede/faktiske enheder, udlejning, rådighed, tilladelser og dokumentation. Kong Georgs Vej 2 er et historisk testeksempel på, at én annonce kan dække flere boliger og et uafklaret projekt. [P1]
Opdelingspotentiale må ikke indgå som sikker værdiforøgelse. Ved et muligt delsalg skal midlertidigt finansieringsbehov og endelig nettoomkostning vises separat. Juridiske regler verificeres konkret; appen giver en dokumentationsliste, ikke automatisk godkendelse.
F12. Ændringsvarsler og beslutningshistorik
På sigt: varsler for en fulgt bolig, når pris, genudbud, salgsstatus eller dokumentation ændrer sig, eller når en relevant ny sammenligningshandel bliver kendt.
Et varsel skal forklare ændringen og dens indvirkning: “Prisen er faldet 150.000 kr.; dit nødvendige ekstra afslag er nu X i det valgte scenario.”
Start med in-app hændelser, der er testet fra kilde til bruger. En indstilling til notifikation er ikke i sig selv dokumentation for, at email eller push bliver leveret.
Gem beslutningshistorik: hvorfor en bolig blev valgt fra, hvilke forudsætninger der gjaldt, og hvad der siden har ændret sig. Genbesøg skal ikke betyde, at gamle noter eller tidligere beregninger overskrives.
Del B — Data og implementation
3. Normaliseret datagrundlag
Bevar den eksisterende ejendomsvisning som læsemodel. Tilføj kun de tabeller/typer, der mangler efter schema-inspektion. Navnene her er forslag, ikke verificerede eksisterende tabeller.
Logisk model	Indhold
property_identity / property_units	Ejendom, bygning og boligenhed; eksterne identifikatorer og verificeret sammenkobling
listing_campaigns	Et samlet salgsforløb med begrundelse for sammenkædning
listing_episodes	Separate aktive udbudsperioder og mæglere
listing_events	Første udbud, prisændring, pause, genudbud og fjernelse
sale_transactions	Registrerede salg, handelstype og link til korrekt forløb
source_observations	Feltværdier, kilder, datoer, præcision, dataMode og konflikter
condition_evidence	Tekst-/dokumentfund og klassifikation med version
buying_projects	Private krav og budgetramme
property_assessments	Noter, budgetscenarier, spørgsmål og næste handling
analysis_runs	Filtre, dataversion, metodeversion og de konkrete indgående handler


Undgå både at lave en helt ny platform og at gemme alt som uigennemsigtig JSON. Begynd med transaktioner, perioder, prisbegivenheder og evidens; en generel event-sourcing-arkitektur er ikke nødvendig.
Identitetsmatch må ikke baseres alene på næsten samme adresse eller koordinat. Hele ejendomme og lejligheder i samme hus skal kunne adskilles. Flere kilder til samme handel må ikke tælles som flere handler.
4. Import af projektets eksisterende Excel-data
Den kendte arbejdsfil er Boligsalg_Aalborg_Hasseris_med_prislofter.xlsx. [P1]
Lav en kontrolleret import med:
1. Preview af kolonnemapping.
2. Reference til kildefil, fane, række, version og indsamlingstidspunkt.
3. Validering af datoer, priser, typer og definitioner.
4. Dubletkontrol mod eksisterende ejendomme/handler.
5. Separat kø af tvivlsomme sammenkoblinger.
6. Importlog med accepterede/afviste observationer.
Importér salgsgrundlaget og evidensen. Importér ikke de gamle prisvurderinger og rangeringer som sandheder. Budgetbaserede resultater skal genberegnes under den gældende projektprofil.
Kendte historiske kontroltal:
- 437 salgsrækker.
- 317 dokumenterede prispar.
- 281 med både prispar og gyldig liggetid.
- 79 / 77 / 65 / 44 / 16 i de fem intervalgrupper. [P1]
Kontroltallene gælder det gamle udvalg med dets gamle filtre. Hvis validering eller nye kilder ændrer tallene, skal en afstemning forklare forskellen frem for at tvinge importen til at matche.
Ikke alle 437 rækker har dokumenteret boligareal eller historisk salgsbeskrivelse. En “minimum 130 m²”-analyse kræver reel arealdækning; man må ikke blot overføre de samlede 281 observationer til dette filter.
5. Statistikmotor som testbar kode
Foreslå rene TypeScript-funktioner for:
- Prisfald og yderligere afslag.
- Projektbudget og scenarier.
- Sammenkædning af dokumenterede perioder.
- Inklusion/udelukkelse af observationer.
- Gruppefordelinger, medianer og kvartiler.
- Forklaringer og datadækning.
Placér dem i en afgrænset delt domænemodel, eksempelvis et nyt packages/shared/src/analysis/, hvis det passer til den faktiske struktur. UI-komponenter skal ikke selv implementere deres egen rabatformel.
Aggregeringer kan køres i databasen eller i den fælles kode, men skal have samme definitioner. Cache-nøgler skal inkludere dataversion, filterdefinition, pris-/tidsmål og relevante privatlivsgrænser.
Giv hver analyse et reproducerbart snapshot. Senere opdateringer må ikke ændre et allerede eksporteret fremvisningsgrundlag uden at vise, at datagrundlaget er nyt.
6. Datakvalitet og sikker drift
Før prisreferencer bruges:
- Hold demo-/mockdata helt ude af produktionsstatistik.
- Vis datakildens tilgængelighed og alder.
- Opdater nye salgsbegivenheder uafhængigt af, om den aktuelle annoncepris ændrer sig.
- Kontroller dækningen af både nye annoncer og gamle langliggere.
- Behandl delvise crawlresultater som delvise, ikke som komplette markedsudtræk.
- Valider salgsdatoer mod observationsdatoer; fremtidige eller uklare hændelser skal i kontrolkø.
- Brug kildeadgang på tilladte vilkår; planlæg ikke omgåelse af blokeringer.
- Afklar opbevarings-/brugsrettigheder til annoncer, tekster og billeder.
- Beskyt offentlige registeropslag mod misbrug med relevante adgangs- og frekvensgrænser.
- Hold familieprofil, privat maksimumpris, noter og dokumenter bruger-/projektadskilt.
Kilde- og metodeversioner er en produktfunktion, ikke kun en driftsdetalje.
7. Accepttests før frigivelse
Test	Forventet resultat
5 mio. samlet, 150.000 omkostninger, 650.000 arbejder, 200.000 reserve	Maksimal købspris 4 mio.
Første 6 mio., sidste 5,5 mio., salg/mål 5 mio.	16,67 % totalfald; 9,09 % fra sidste pris
Første pris mangler	Intet samlet prisfald beregnes
447 samlede dage, 91 i seneste periode	Adskilte felter; korrekt historisk sammenligning
Samtidige annoncer i to kilder	Aktiv liggetid tælles ikke dobbelt
Solgt over første udbud	Negativt afslag bevares
Familiehandel	Bevares som historik; udelades som standard fra frihandelsreference
116 m² bolig plus stor kælder	Opfylder ikke 130 m²-kravet
“Kræver totalrenovering” vs. “totalrenoveret”	Forskellige signaler
Tekst efter salgsdato om nyere renovering	Ingen automatisk historisk standstilknytning
Uddrag mangler	Ukendt stand, ikke renoveringsfri
Kun én brugbar 130+-renoveringsreference	Tydelig advarsel, ingen generel renoveringsrabat
Mock eller utilgængelig registerkilde	Ingen falsk verificeret oplysning eller nulværdi
Delvist crawl uden tidligere annonce	Ikke automatisk solgt/fjernet
Delsalg kun en idé	Ingen sikker budgetmodregning
Ny privat maksimalpris	Ikke synlig for mægler uden aktiv deling
Udkast til mægler	Ingen automatisk afsendelse
Q3 fra historiske salg	Ikke betegnet som sandsynlighed for sælgers accept
Sæson og liggetidsreference på samme handler	Ingen addition af to “rabatter”


8. Hvad der bør vente
Udskyd automatiske præcise boligvurderinger, juridiske opdelingsafgørelser, diagnoser fra fotos, store finansierings-/investorberegnere og en generisk AI-chat uden kildegrundlag.
En senere prismodel bør først udvikles med nok relevante og historisk konsistente observationer, tidsopdelt validering, korrekt behandling af igangværende udbud og en dokumenteret fejlmargin. De 437 lokale salgsrækker alene dokumenterer ikke en sådan model.
Første produktmål er ikke “flest AI-features”. Det er, at en bruger med et konkret annoncelink får en troværdig beslutning om næste skridt, kan efterprøve prisreferencen og har brugbare spørgsmål inden fremvisningen.
9. Effektmål
Mål funktionens nytte:
- Andel kandidatboliger med klar begrundelse for næste handling.
- Tid fra tilføjet annonce til en brugbar fremvisningsbeslutning.
- Andel nøgletal med synlig kilde, nævner og definition.
- Antal afgørende spørgsmål afklaret før fremvisning.
- Antal manuelle rettelser af boligenhed, areal, periode og stand.
- Andel forkert klassificerede eller dublerede observationer.
- Brug af “se handlerne bag tallet” og gemte sammenligningsudvalg.
Mål ikke appens succes alene på størrelsen af brugerens prisafslag: et stort afslag kan begynde med en for høj udbudspris.
Kilder og sporbarhed
[R1] Repoets README, læst 26. september 2026. Dokumentationsstatus, ikke liveaudit.
https://github.com/scottlinddk/BoligData
https://raw.githubusercontent.com/scottlinddk/BoligData/main/README.md
[P1] Brugerens projektinstruktioner:
Projektinstruktioner_Boligkoeb_Aalborg.md, version 1.0, 26. september 2026. Læst i denne opgave. Samler brugerkrav og tidligere beregninger. Statistikken er historisk reference fra indsamling 23. september 2026 og er ikke nygenberegnet her.
Arbejdsdata til senere import:
Boligsalg_Aalborg_Hasseris_med_prislofter.xlsx. Regnearket er ikke ændret eller fuldt genberegnet i denne leverance.
Alle features, modelnavne, prioriteringer, skærmbilledebeskrivelser og acceptkriterier i planen er nye forslag, medmindre noget udtrykkeligt beskrives som historiske projektdata eller dokumenteret i repoet.