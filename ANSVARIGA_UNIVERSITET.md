# Översikt för ansvariga vid svenska universitet

## Målgrupp

Den här texten är skriven för personer som behöver förstå och fatta beslut om en akut Canvas-backup utan att själva behöva vara utvecklare. Det kan till exempel vara utbildningsansvariga, systemägare, förvaltningsledare, IT-chefer, informationssäkerhetsansvariga, dataskyddsfunktioner, arkivfunktioner och andra ansvariga vid svenska universitet.

## Kort sammanfattning

Detta projekt är ett praktiskt stöd för att snabbt kunna säkerhetskopiera kursmaterial och viktig kursinformation från Canvas om ett lärosäte hamnar i ett akut läge. Det kan handla om driftstörningar, cyberincidenter, leverantörsproblem, migreringar eller andra situationer där utbildningsmaterial riskerar att bli svårt att nå.

Syftet är inte att ersätta Canvas, Ladok, ett arkivsystem eller ordinarie informationsförvaltning. Syftet är att skapa en kontrollerad och granskningsbar kopia av utbildningsmaterial så att lärare, programansvariga och förvaltning har något att falla tillbaka på.

## Vad är detta?

Detta är dokumentation och ett skript för nödbackup av Canvas-kurser. Skriptet hämtar information via Canvas egna API, alltså Canvas maskinläsbara gränssnitt för kontrollerad åtkomst.

I praktiken kan det:

- hitta kurser inom ett valt Canvas-konto eller en vald lista med kurs-id:n,
- välja bort uppenbara test- och sandlådemiljöer, inklusive underkonton vars namn matchar "Sandbox" enligt samma kantregel som kursfilter,
- hämta kursfiler och kursmaterial,
- spara kursens struktur, till exempel moduler, sidor och uppgifter,
- spara lärar-, undervisningsassistent-/TA- och designerroller för uppföljning,
- spara loggar och manifest som visar vad som lyckades, vad som hoppades över och vad som behöver försökas igen.

Man kan se det som en ordnad export av det man behöver för att förstå och återfinna en kurs. Det är inte en komplett kopia av allt som någonsin hänt i Canvas.

## Varför behövs det?

Canvas innehåller ofta mycket mer än filer. En kurs kan bestå av moduler, sidor, uppgifter, quiz/test, diskussioner, anslag, länkar, bedömningsmatriser, externa verktyg och inställningar. Om man bara laddar ner filytan missar man därför ofta sammanhanget: i vilken ordning materialet skulle läsas, vilka instruktioner som fanns, vilka deadlines som var synliga och vilka lärare som ansvarade för kursen.

Vid en akut situation är det ofta viktigare att först bevara tillräckligt mycket än att direkt göra en perfekt gallring. Gallring, sortering och juridisk bedömning kan göras efteråt, men förlorat utbildningsmaterial går inte alltid att skapa om.

## Vad gör skriptet i enkla ord?

Skriptet går igenom valda Canvas-kurser och sparar en lokal kopia av kursrelaterad information. Det skapar en mapp per kurs och lägger där:

- nedladdade filer,
- Canvas-sidor och kursbeskrivningar,
- moduler och modulobjekt,
- uppgifter, quiz, diskussioner och anslag,
- kursinställningar, flikar och sektioner,
- bedömningsmatriser/rubrics, lärandemål, kalenderhändelser, grupper och externa verktygsreferenser när de går att hämta,
- information om lärare, undervisningsassistenter/TA och designers,
- manifest som visar vad som har hämtats och eventuella fel.

Skriptet kan också, om det godkänns, starta Canvas egna kursexporter för att få en extra återställningsorienterad kopia.

## Vad gör det inte?

Första versionen är avsiktligt avgränsad. Den ska inte medvetet hämta:

- studentinlämningar,
- betyg eller gradebook-exporter,
- aktivitetsloggar,
- privata konversationer,
- studentrollistor, inklusive rollen `Ladokstudent`.

Det betyder inte att backupen är okänslig. Kursfiler och kurssidor kan ändå innehålla personuppgifter eller känsligt material. Backupen ska därför hanteras som skyddsvärd information.

Ägaren har förtydligat att inga större känsliga PII-risker förväntas i systemet. Skriptet försöker ändå undvika avsiktlig hämtning av studentregisterliknande data, och tokenfiler samt backupresultat ska hållas utanför Git.

Skriptet laddar inte ner Canvas Studio-material i den här körningen, eftersom det nästan alltid är stort. Det kan spara referenser till Studio, LTI-verktyg, Canvas New Quizzes eller material bakom externa länkar, men Canvas New Quizzes är tills vidare bara en dokumenterad lucka och inte ett större hämtningsspår.

## Vilka beslut behövs innan bred körning?

Innan ett lärosäte kör detta brett bör ansvariga fatta och dokumentera beslut om:

- vilket Canvas-konto eller vilka underkonton som ingår,
- vilka kursstatusar och datumgränser som ska användas,
- vilka test-, sandlåda-, mall- eller demokurser som ska väljas bort, även utifrån underkontonamn,
- var backupen ska lagras och vem som får åtkomst,
- hur mycket lagringsutrymme som finns,
- om Canvas egna exportpaket ska skapas,
- vilka personuppgifter som uttryckligen inte ska hämtas,
- om någon extern kurs- eller studenttäckningslista ska användas för kontroll,
- vem som ansvarar för efterkontroll, gallring och eventuell återläsning.

Det är särskilt viktigt att kontrollera lokala filter innan bred körning. Ett filter som låter rimligt, till exempel att välja bort ordet "test", kan i vissa miljöer även träffa riktiga kurser. I detta projekt matchar därför filtertermer bara i början av ett fält följt av ett icke-a-z-tecken, eller längst sist i fältet.

I detta projekt är exempelkonfigurationen just nu inställd på att bara ta med kurser som skapats från och med `2025-04-01`. Den gränsen behöver fortfarande bedömas mot lärosätets faktiska behov innan en bred körning görs.

## Vad får man ut?

Resultatet blir en mappstruktur med en mapp per kurs. I varje kursmapp finns både material och granskningsfiler. På övergripande nivå finns bland annat:

- en lista över valda och bortvalda kurser,
- en sammanfattning av körningen,
- en lista över kurs-id:n eller fel som kan provas igen,
- inställningar för körningen, med token och andra hemligheter bortmaskerade.

Detta gör att en ansvarig person i efterhand kan se vad som faktiskt hämtades, vilka delar som saknas och vad som behöver följas upp.

## Hur bör backupen hanteras?

Backupen ska behandlas som skyddsvärd verksamhetsinformation. Den bör ligga på en godkänd lagringsplats med begränsad åtkomst, tydligt ägarskap och dokumenterad hantering. Den bör inte lagras i Git eller på personliga ytor. Åtkomsttoken till Canvas ska aldrig checkas in i kodförrådet.

Eftersom nödbackupen kan innehålla personuppgifter bör dataskydd, informationssäkerhet, arkiv/informationsförvaltning och utbildningsförvaltning vara med i beslutet om omfattning och efterarbete.

## Hur kan andra svenska lärosäten använda detta?

Detta repository är anpassat för Lunds universitets Canvas-installation, men arbetssättet kan återanvändas av andra svenska lärosäten som använder Canvas. Det som normalt behöver anpassas är Canvas-adress, kontoavgränsning, behörigheter, lokala kursfilter, lagringsplats och lokala beslut om personuppgifter.

En försiktig arbetsgång är:

1. Kör en konfigurationskontroll utan att hämta kursmaterial.
2. Kör en listning av valda och bortvalda kurser.
3. Granska urvalet med utbildnings- och systemansvariga.
4. Kör en liten provbackup på några kända kurser.
5. Granska resultat, fel och lagringsbehov.
6. Besluta om bred körning och efterkontroll.

## Nuläge i detta projekt

Skriptet `scripts/canvas-backup.mjs` är godkänt som första validerings- och nödbackupväg för detta projekt. Två mindre provkörningar har gjorts på utvalda kurser vid Lunds universitet med lyckat resultat. En bred körning är däremot fortfarande beroende av beslut om omfattning, filter, lagring, personuppgiftsgränser och ansvar för efterarbete.
