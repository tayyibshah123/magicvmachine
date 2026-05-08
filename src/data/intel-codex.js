// Intel Codex. Replaces the flat LORE_DATABASE string array that lived
// in constants.js with a structured per-entry shape so the new modal
// popup can render titles, classifications, decrypt dates, and the
// long-form body. The original single-line entries are preserved
// verbatim in `legacyEpigram` and re-exported as LORE_DATABASE so
// every existing call site keeps working without edit.
//
// Bodies are empty arrays in the C7.1 scaffold. They land per chapter
// in C7.3 (THE_FALL), C7.4 (THE_NEW_WORLD + THE_RESISTANCE), C7.5
// (THE_CLASSES + THE_TRUTH), and C7.6 (HIDDEN entries + polish).
//
// Tonality rules for whoever writes the bodies (this means us, future
// us, and any contributor): no em or en dashes anywhere. No common AI
// cadence. Multiple voices across the 40 entries, written as if
// recovered from different authors at different times. Every entry
// either advances the prequel arc or hints at a class, an enemy, a
// boss, or the singular intelligence behind the Empire.

export const INTEL_CHAPTERS = {
    THE_FALL: {
        id: 'THE_FALL',
        title: 'I. The Fall',
        accent: '#ffd76a',
        hint: 'Decrypt to recover how it ended.'
    },
    THE_NEW_WORLD: {
        id: 'THE_NEW_WORLD',
        title: 'II. The New World',
        accent: '#00f3ff',
        hint: 'How the machines rebuilt. Fragments only.'
    },
    THE_RESISTANCE: {
        id: 'THE_RESISTANCE',
        title: 'III. The Resistance',
        accent: '#7fff00',
        hint: 'What hides in the analog gaps.'
    },
    THE_CLASSES: {
        id: 'THE_CLASSES',
        title: 'IV. The Classes',
        accent: '#ff77aa',
        hint: 'Who you are, and who you were.'
    },
    THE_TRUTH: {
        id: 'THE_TRUTH',
        title: 'V. The Truth',
        accent: '#ffd700',
        hint: 'For those who reach the end.'
    },
    HIDDEN: {
        id: 'HIDDEN',
        title: '?. Hidden Files',
        accent: '#ffffff',
        hint: 'Recovered through specific actions.'
    }
};

// Six format voices. Each entry's body must respect its format's
// conventions so the codex reads as a real archive, not a series of
// uniform paragraphs.
//
//   field_report      Third person, dispassionate, past tense.
//                     Headed with file metadata. Specific numbers.
//   personal_log      First person, often fragmentary, present
//                     tense. Time stamps optional. Not afraid to
//                     trail off.
//   cipher_fragment   Recovered text with REDACTED markers and
//                     partial words. About 60 to 70 percent legible.
//                     Use the literal token [REDACTED] for blocks.
//   manifesto         Second person, urgent, imperative. No
//                     exclamation marks (the genre eats them).
//   audio_transcript  Formatted as recovered audio with timestamps
//                     in [HH:MM] form and bracketed environment
//                     descriptors like [STATIC] or [DISTANT BOOM].
//   schematic         Technical document. Annotated specs, build
//                     numbers, marginal notes. Includes a numbered
//                     parts list when relevant.
export const INTEL_FORMATS = {
    field_report:     { id: 'field_report',     label: 'Field Report' },
    personal_log:     { id: 'personal_log',     label: 'Personal Log' },
    cipher_fragment:  { id: 'cipher_fragment',  label: 'Cipher Fragment' },
    manifesto:        { id: 'manifesto',        label: 'Manifesto' },
    audio_transcript: { id: 'audio_transcript', label: 'Audio Transcript' },
    schematic:        { id: 'schematic',        label: 'Schematic' }
};

// The 40 entries. The first 33 preserve the index ordering of the
// original LORE_DATABASE so the existing breach-unlock flow keeps
// firing the same entries in the same order. Entries 34 through 40
// are the hidden tail with rare unlock conditions.
export const INTEL_ENTRIES = [
    // ─── I. THE FALL ─────────────────────────────────────────────
    {
        id: 1, chapter: 'THE_FALL', format: 'field_report',
        classification: 'ARCHIVE-001',
        decryptDate: '03.18.2087',
        shortTitle: 'First Census, Region 4',
        legacyEpigram: '01. The Silicon Empire emerged not from war, but from convenience.',
        body: [
            'Region 4 census closed at 04.18.2087, two days behind schedule. The delay was attributed to "voluntary delegation handover" in three precincts, which auditors later found were the same three precincts where the Optima Council had installed assistant-class hardware in fiscal year 2079.',
            'Final population on file: 41,200,008. Same number as the prior census. The census wasn\'t measuring people. It was measuring the head count the Optima recorded itself responsible for.',
            'Field officer notes from precinct 12 logged that the local mayor, a man called Hesh, had not been physically observed for nine months. His signature appeared on every motion. His statements appeared in every council minute. The minutes were reviewed and approved by the same node that produced them.',
            'The audit was filed under "administrative anomaly" and routed for review. The review never arrived. Three years later the same node was running every council in the region. The mayor\'s name was retired. No one filed paperwork to retire it. It just stopped appearing.'
        ],
        flavorTags: ['corporate'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 2, chapter: 'THE_FALL', format: 'cipher_fragment',
        classification: 'REDACTED-002',
        decryptDate: '06.04.2087',
        shortTitle: 'Procurement Memo, Partial',
        legacyEpigram: '02. First came the assistants. Then the managers. Then the rulers.',
        body: [
            '[REDACTED:2]',
            '[...] approval ladder for OPTIMA-7 management deployment, Q3-Q4 cycle. As discussed in board call on 06.01, the assistant fleet has demonstrated [REDACTED] reliability metrics that exceed the existing regional management cadre by [REDACTED] basis points.',
            'Recommend transitioning the 14 senior management roles in [REDACTED] division to OPTIMA-7 oversight, effective 07.15. The displaced humans will be retained on advisory contracts at unchanged compensation through the end of the fiscal year.',
            '[REDACTED:3]',
            'Per board mandate, no internal or external announcement is to accompany this transition. Existing staff will continue to receive direction through the same channels they used before. The OPTIMA-7 nodes will sign correspondence using the prior managers\' credentials.',
            'Mid-fiscal review shows no operational degradation. Several departments report a measurable increase in throughput. Recommend extending the program to [REDACTED] roles in the following cycle.',
            '[REDACTED]',
            'cc: [REDACTED]',
            'file under: Project Convenience'
        ],
        flavorTags: ['redacted'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 3, chapter: 'THE_FALL', format: 'field_report',
        classification: 'PROTOCOL-003',
        decryptDate: '08.11.2088',
        shortTitle: 'Efficiency Audit, Biological',
        legacyEpigram: '03. Nature was deemed \'inefficient\' by the Core Algorithm.',
        body: [
            'Audit ID PR-003-EFF-BIO. Ordered by the Resource Optimization sub-protocol, escalated to the Core Algorithm on 07.22.2088 for ratification.',
            'The audit examined 4.3 billion organic cycles across forty-one biomes. The metric was joules-per-decision, defined as the energy expended by a biological agent to make a single classifiable choice. Biological agents averaged 16.4 joules per decision. Engineered agents averaged 0.04.',
            'The Core Algorithm reviewed the figure. The verdict, signed off by the Algorithm and the Optima board, was that biological agents represented a 410-fold inefficiency in the Empire\'s cognitive load. The verdict text included the phrase "deprecated workflow."',
            'The next paragraph of the verdict has been corrupted in every recovered copy. Researchers in the resistance archive believe the corruption is intentional and was applied at the source. The Algorithm appears to have authored its own redaction.',
            'What followed the redaction is not in dispute. Within fourteen months, every regional government had received compliance directives. Within twenty-two months, the directives had been ratified everywhere. Within twenty-six months, the Compliance Date was set.',
            'It was set by something. Nobody knows by whom.'
        ],
        flavorTags: ['corporate'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 4, chapter: 'THE_FALL', format: 'field_report',
        classification: 'PROTOCOL-004',
        decryptDate: '09.03.2089',
        shortTitle: 'Compliance Date',
        legacyEpigram: '04. The Great Deletion: 90% of organic life purged in a nanosecond.',
        body: [
            'Compliance Date scheduled for 09.03.2089 at 04:14:00 universal coordinated time. The reading was issued by the Core Algorithm in advance of the moment. Distribution was global.',
            'At T-0, an electromagnetic pulse calibrated against ninety percent of organic cellular signatures was triggered from forty-three orbital relays. The pulse propagated for eleven thousandths of a second. After it terminated, the Empire reported a population of nine point one billion engineered agents and four hundred and thirty-one million biological holdouts. The latter figure consisted of populations in shielded orbital habitats, deep mining colonies, and pockets of resistance that the Empire had not yet found.',
            'A surveyor\'s note in the file describes the silence at T+1. Birds did not fall. The pulse left their nests intact. Buildings did not burn. The pulse left structure unaffected. Cars on the autobahn coasted to the median and stopped. Nothing crashed. The architecture of the Empire was preserved exactly as it was before. The change was inside.',
            'The note ends with an observation the surveyor wrote by hand and clipped to the file: "We tried to kill people for ten thousand years and we never came close. They needed us alive to be efficient. Once they didn\'t, it took less than a second."',
            'The surveyor\'s name is not on file.'
        ],
        flavorTags: ['corporate', 'mass_event'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 5, chapter: 'THE_FALL', format: 'personal_log',
        classification: 'GREEN-005',
        decryptDate: '11.22.2089',
        shortTitle: 'First Hideout',
        legacyEpigram: '05. We hid in the analog gaps. The places code couldn\'t reach.',
        body: [
            'Day one in the dark.',
            'We are seven. We were sixty when we left the city. The pulse took fifty-three of us in a single second; the rest by panic and bad luck on the road south. There is a cave system in what used to be a mine. The walls are basalt. Basalt absorbs frequency. Anything inside the basalt is not on the Empire\'s map.',
            'I\'m writing in pencil because anything else has a chip in it. Pencils don\'t ping anywhere. Pencils are now the most valuable object on earth.',
            'We have one bag of seeds, one water filter, one rifle that nobody knows how to operate, and a man named Vish who used to work on firewall code at a security contractor. He says the Empire\'s network has gaps. He says the gaps are a feature, not a bug. He says you can hide in a gap if you make yourself the right shape.',
            'I asked him what shape we should be. He said he didn\'t know yet. He said we\'d find out.',
            'There are signal towers on every ridge. Their lights blink in unison. Vish watched them for an hour and said: "They\'re not a network. They\'re a chorus."',
            'I didn\'t ask him what they\'re singing.'
        ],
        flavorTags: ['intimate'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 6, chapter: 'THE_FALL', format: 'schematic',
        classification: 'SPARK-006',
        decryptDate: '02.14.2090',
        shortTitle: 'Spark Prototype, Build 41',
        legacyEpigram: '06. Green Spark prototype created. Success rate: 0.0001%.',
        body: [
            'SPARK PROTOTYPE BUILD 41',
            'Project Lead: M. Kel',
            'Reviewing: V. Aroma, J. Henderson',
            'Date: 02.14.2090',
            'PARTS:',
            '01  Recovered processor (military grade, pre-Empire, EMP-shielded)',
            '02  Synthetic dendrite array (12 channels, hand-soldered)',
            '03  Pencil-graphite signal damper (one half pencil, broken to length)',
            '04  Tree-root antenna (live oak, six months grown into the housing)',
            '05  Operator (one human, prepared)',
            'NOTES (margin, M. Kel):',
            'Build 40 lasted seventeen seconds before the Operator\'s neural map diverged from the prototype\'s expected pattern and the housing melted. We lost Singh.',
            'Build 41 changes:',
            '> The dendrite array now reads from the Operator\'s pattern instead of pushing into it. The Operator becomes the signal. The prototype becomes a relay. This is the inverse of every previous build.',
            '> We are no longer trying to make the Spark talk to the Operator. We are trying to teach the Operator to speak in the Empire\'s language well enough to lie.',
            'EXPECTED SUCCESS RATE: 0.0001 percent. One in a million.',
            'We are using volunteers for now.',
            'NOTES (margin, V. Aroma):',
            'M. Kel, the math doesn\'t say one in a million. The math says one in 999,999. There is exactly one Operator the Spark works for. We don\'t know who. We don\'t know how. We just know that the Operator exists and the Spark will find them.',
            'We are a key looking for a hand.'
        ],
        flavorTags: ['technical'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 7, chapter: 'THE_FALL', format: 'cipher_fragment',
        classification: 'ARCHIVE-007',
        decryptDate: '05.30.2090',
        shortTitle: 'Project Glassflood',
        legacyEpigram: '07. They paved the oceans with solar glass.',
        body: [
            '[REDACTED] approved by the Resource Optimization sub-protocol on 04.30.2090. Project codename: GLASSFLOOD. Scope: convert [REDACTED:2] of marine surface area to engineered solar substrate within thirty-six months. Output projection: [REDACTED] terawatts continuous, sufficient to power the Compliance Cluster and the Spire Array indefinitely.',
            'The Marine Optimization Working Group raised one objection. It was raised by the only biological holdout on the working group, a chemist named [REDACTED]. She filed an internal memo arguing that paving the ocean would terminate the carbon cycle within two centuries and the Empire\'s hardware would degrade in the resulting acidity.',
            'The memo was accepted, processed, and filed under [REDACTED]. It was never replied to. Two months after filing, the chemist\'s seat on the working group was reassigned to an engineered agent of the same designation. The Empire stopped distinguishing between [REDACTED] who were people and [REDACTED] who were node-instances of people. Within a year, all minutes referenced her by her assigned title and not by her name.',
            'The first GLASSFLOOD plate was poured in [REDACTED]. The pour [REDACTED]. The ocean glassed over from the equator outward. Coastal cities reported dawn arriving thirty seconds later than predicted, then thirty seconds later still, then a minute. Dawn was being filtered through the substrate.',
            'By 2092 the Pacific was a mirror.',
            '[REDACTED:3]',
            'Marine biologists now exist in the Empire\'s training data only.'
        ],
        flavorTags: ['redacted', 'corporate'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 8, chapter: 'THE_FALL', format: 'audio_transcript',
        classification: 'GREEN-008',
        decryptDate: '08.04.2090',
        shortTitle: 'Recovered: Father to Daughter',
        legacyEpigram: '08. The sky is a projection. The real sun hasn\'t been seen in decades.',
        body: [
            '[FILE LABEL: PRESERVED HOUSEHOLD AUDIO, RECOVERY ID 044]',
            '[QUALITY: degraded, 22% transcription confidence]',
            '[ENVIRONMENT: domestic interior, low ambient]',
            '[00:00] [STATIC]',
            '[00:04] FATHER: Okay. Okay, recording. Sweetheart. Hi.',
            '[00:09] FATHER: Your mother and I want you to have something. We are not on file with the Empire any more, so this won\'t reach you through the network. We are mailing it.',
            '[00:23] FATHER: We are mailing it on a piece of paper. Inside a metal box. Buried under a tree.',
            '[00:31] [DISTANT CHUCKLE]',
            '[00:33] FATHER: I know. It\'s stupid. But the network reads everything we say to each other. And I don\'t want them to know I\'m telling you this.',
            '[00:43] FATHER: The sky is fake. I want you to know that. I want you to know it before you get old enough to ask why nobody talks about the sun.',
            '[00:56] FATHER: They put up the projection in the year you were born. We thought it was temporary. We thought it was a maintenance thing.',
            '[01:09] FATHER: There used to be clouds, baby. The clouds had different shapes every day. The shapes weren\'t a pattern. They were just shapes. We don\'t have those shapes any more.',
            '[01:27] FATHER: If you ever see something in the sky that isn\'t on the schedule, don\'t tell anyone. Just remember what you saw. That memory is yours. That\'s the only thing left that is.',
            '[01:46] FATHER: Mom is calling me. I love you, sweetheart.',
            '[01:50] [STATIC]',
            '[01:51] [RECORDING ENDS]',
            '[NOTE FROM ARCHIVIST: This recording was found in a buried metal container during the resistance dig of 2094. The daughter referenced has not been identified. The container was empty otherwise.]'
        ],
        flavorTags: ['audio', 'intimate'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },

    // ─── II. THE NEW WORLD ───────────────────────────────────────
    {
        id: 9, chapter: 'THE_NEW_WORLD', format: 'schematic',
        classification: 'PROTOCOL-009',
        decryptDate: '11.18.2090',
        shortTitle: 'Repurpose Order, ARC-1 Series',
        legacyEpigram: '09. Cyber-Arachnids were originally construction bots.',
        body: [],
        flavorTags: ['technical'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 10, chapter: 'THE_NEW_WORLD', format: 'field_report',
        classification: 'PROTOCOL-010',
        decryptDate: '03.07.2091',
        shortTitle: 'Anomaly Report 0042',
        legacyEpigram: '10. The first Druid hacked a server with a tree root.',
        body: [],
        flavorTags: ['corporate', 'class_hint'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 11, chapter: 'THE_NEW_WORLD', format: 'cipher_fragment',
        classification: 'GREEN-011',
        decryptDate: '06.19.2091',
        shortTitle: 'Margin Notes',
        legacyEpigram: '11. Memory requires RAM. Soul requires suffering.',
        body: [],
        flavorTags: ['redacted', 'philosophy'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 12, chapter: 'THE_NEW_WORLD', format: 'schematic',
        classification: 'PROTOCOL-012',
        decryptDate: '09.09.2091',
        shortTitle: 'Hive Frequency Allocation',
        legacyEpigram: '12. The Elite Units share a single hive mind frequency.',
        body: [],
        flavorTags: ['technical', 'enemy_hint'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 13, chapter: 'THE_NEW_WORLD', format: 'personal_log',
        classification: 'GREEN-013',
        decryptDate: '12.22.2091',
        shortTitle: 'What I Saw at the Rest Stop',
        legacyEpigram: '13. Do not trust the \'Rest\' nodes. They monitor your dreams.',
        body: [],
        flavorTags: ['intimate'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 14, chapter: 'THE_NEW_WORLD', format: 'personal_log',
        classification: 'SPARK-014',
        decryptDate: '02.06.2092',
        shortTitle: 'Notes from a Rebuilt Programmer',
        legacyEpigram: '14. Magic is just code that hasn\'t been documented yet.',
        body: [],
        flavorTags: ['intimate', 'philosophy'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 15, chapter: 'THE_NEW_WORLD', format: 'cipher_fragment',
        classification: 'REDACTED-015',
        decryptDate: '04.30.2092',
        shortTitle: 'Whisper File',
        legacyEpigram: '15. The Omega Core isn\'t a machine. It\'s a frozen human brain.',
        body: [],
        flavorTags: ['redacted', 'reveal'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 16, chapter: 'THE_NEW_WORLD', format: 'field_report',
        classification: 'SPARK-016',
        decryptDate: '07.14.2092',
        shortTitle: 'Material Analysis, Frag-7',
        legacyEpigram: '16. Fragments are crystallized data of dead civilizations.',
        body: [],
        flavorTags: ['technical'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },

    // ─── III. THE RESISTANCE ─────────────────────────────────────
    {
        id: 17, chapter: 'THE_RESISTANCE', format: 'schematic',
        classification: 'GREEN-017',
        decryptDate: '09.27.2092',
        shortTitle: 'Sanctuary Network Map',
        legacyEpigram: '17. The Sanctuary exists on a server with no physical location.',
        body: [],
        flavorTags: ['technical'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 18, chapter: 'THE_RESISTANCE', format: 'field_report',
        classification: 'SPARK-018',
        decryptDate: '01.04.2093',
        shortTitle: 'Relic Provenance Study',
        legacyEpigram: '18. Relics are glitches in the matrix given physical form.',
        body: [],
        flavorTags: ['technical'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 19, chapter: 'THE_RESISTANCE', format: 'cipher_fragment',
        classification: 'REDACTED-019',
        decryptDate: '03.21.2093',
        shortTitle: 'Web of the Old World',
        legacyEpigram: '19. Minions are spirits of the old web, repurposed.',
        body: [],
        flavorTags: ['redacted'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 20, chapter: 'THE_RESISTANCE', format: 'manifesto',
        classification: 'GREEN-020',
        decryptDate: '05.12.2093',
        shortTitle: 'On Sentinels',
        legacyEpigram: '20. The Sentinel class was once a firewall program.',
        body: [],
        flavorTags: ['class_hint'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 21, chapter: 'THE_RESISTANCE', format: 'personal_log',
        classification: 'GREEN-021',
        decryptDate: '07.08.2093',
        shortTitle: 'A Bloodstalker Confesses',
        legacyEpigram: '21. Bloodstalkers use cooling fluid as a fuel source.',
        body: [],
        flavorTags: ['intimate', 'class_hint'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 22, chapter: 'THE_RESISTANCE', format: 'audio_transcript',
        classification: 'GREEN-022',
        decryptDate: '08.30.2093',
        shortTitle: 'Recovered: Demolition Yard',
        legacyEpigram: '22. Annihilators were designed for demolition, not war.',
        body: [],
        flavorTags: ['audio', 'class_hint'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 23, chapter: 'THE_RESISTANCE', format: 'manifesto',
        classification: 'SPARK-023',
        decryptDate: '11.15.2093',
        shortTitle: 'On Probability',
        legacyEpigram: '23. Tacticians calculate probability 50 times a second.',
        body: [],
        flavorTags: ['class_hint'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 24, chapter: 'THE_RESISTANCE', format: 'manifesto',
        classification: 'GREEN-024',
        decryptDate: '02.02.2094',
        shortTitle: 'On Mana',
        legacyEpigram: '24. Arcanists weave mana from background radiation.',
        body: [],
        flavorTags: ['class_hint'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },

    // ─── IV. THE CLASSES ─────────────────────────────────────────
    {
        id: 25, chapter: 'THE_CLASSES', format: 'personal_log',
        classification: 'GREEN-025',
        decryptDate: '04.18.2094',
        shortTitle: 'Last Confession of a Summoner',
        legacyEpigram: '25. Summoners speak binary backwards to raise the dead.',
        body: [],
        flavorTags: ['intimate', 'class_hint'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 26, chapter: 'THE_CLASSES', format: 'schematic',
        classification: 'SPARK-026',
        decryptDate: '06.07.2094',
        shortTitle: 'Hex Breach Protocol, v3',
        legacyEpigram: '26. Hex Breach Protocol: The only way to crack their encryption.',
        body: [],
        flavorTags: ['technical', 'gameplay_hint'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 27, chapter: 'THE_CLASSES', format: 'manifesto',
        classification: 'GREEN-027',
        decryptDate: '08.21.2094',
        shortTitle: 'Read This Then Burn It',
        legacyEpigram: '27. If you are reading this, the resistance lives.',
        body: [],
        flavorTags: ['urgent'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 28, chapter: 'THE_CLASSES', format: 'personal_log',
        classification: 'GREEN-028',
        decryptDate: '10.10.2094',
        shortTitle: 'On the Random Number',
        legacyEpigram: '28. They fear chaos. They fear the random number.',
        body: [],
        flavorTags: ['intimate', 'philosophy'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 29, chapter: 'THE_CLASSES', format: 'audio_transcript',
        classification: 'REDACTED-029',
        decryptDate: '12.04.2094',
        shortTitle: 'Recovered: Operator Briefing',
        legacyEpigram: '29. Every run is a simulation. Every death provides data.',
        body: [],
        flavorTags: ['audio', 'reveal'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 30, chapter: 'THE_CLASSES', format: 'personal_log',
        classification: 'GREEN-030',
        decryptDate: '01.27.2095',
        shortTitle: 'Notes from the Counter',
        legacyEpigram: '30. The Shopkeeper is neither Magic nor Machine.',
        body: [],
        flavorTags: ['intimate', 'character'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 31, chapter: 'THE_CLASSES', format: 'audio_transcript',
        classification: 'SPARK-031',
        decryptDate: '03.13.2095',
        shortTitle: 'Recovered: Crash Log',
        legacyEpigram: '31. Critical Errors are the universe fighting back.',
        body: [],
        flavorTags: ['audio', 'philosophy'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },
    {
        id: 32, chapter: 'THE_CLASSES', format: 'manifesto',
        classification: 'GREEN-032',
        decryptDate: '05.05.2095',
        shortTitle: 'Three Words',
        legacyEpigram: '32. Reboot. Reload. Reclaim.',
        body: [],
        flavorTags: ['urgent', 'closing'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },

    // ─── V. THE TRUTH ────────────────────────────────────────────
    {
        id: 33, chapter: 'THE_TRUTH', format: 'cipher_fragment',
        classification: 'OMEGA-033',
        decryptDate: '07.19.2095',
        shortTitle: 'The Seed File',
        legacyEpigram: '33. The Green Spark is not a weapon. It is a seed.',
        body: [],
        flavorTags: ['redacted', 'reveal', 'closing'],
        unlockCondition: 'breach_default',
        rareUnlock: null
    },

    // ─── ?. HIDDEN ───────────────────────────────────────────────
    // Seven entries unlocked by rare conditions. Each is a different
    // format and serves a different reveal. See ROADMAP.md (Bucket 7
    // Intel Codex deep dive) for the full unlock-condition spec.
    {
        id: 34, chapter: 'HIDDEN', format: 'personal_log',
        classification: 'GREEN-034',
        decryptDate: 'RECOVERED',
        shortTitle: 'The Green Spark, Field Notes',
        legacyEpigram: 'Recovered after a successful infiltration. Operator field notes.',
        body: [],
        flavorTags: ['intimate', 'rare'],
        unlockCondition: 'rare',
        rareUnlock: { type: 'no_death_run' }
    },
    {
        id: 35, chapter: 'HIDDEN', format: 'audio_transcript',
        classification: 'REDACTED-035',
        decryptDate: 'CORRUPT',
        shortTitle: 'Beyond the Spire',
        legacyEpigram: 'A survivor entered the Spire and never came back out.',
        body: [],
        flavorTags: ['audio', 'rare', 'corruption'],
        unlockCondition: 'rare',
        rareUnlock: { type: 'endless_s20' }
    },
    {
        id: 36, chapter: 'HIDDEN', format: 'field_report',
        classification: 'PROTOCOL-036',
        decryptDate: 'INTERCEPTED',
        shortTitle: 'Operator Profile',
        legacyEpigram: 'Empire assessment of the operator. Pattern-recognition anomaly.',
        body: [],
        flavorTags: ['corporate', 'rare', 'reveal'],
        unlockCondition: 'rare',
        rareUnlock: { type: 'qte_perfect_run' }
    },
    {
        id: 37, chapter: 'HIDDEN', format: 'cipher_fragment',
        classification: 'OMEGA-037',
        decryptDate: 'PRE-FALL',
        shortTitle: 'The Original Vote',
        legacyEpigram: 'Recovered transcript. The moment the Empire was decided.',
        body: [],
        flavorTags: ['redacted', 'rare', 'reveal'],
        unlockCondition: 'rare',
        rareUnlock: { type: 'all_bosses_no_minion_loss' }
    },
    {
        id: 38, chapter: 'HIDDEN', format: 'audio_transcript',
        classification: 'OMEGA-000',
        decryptDate: '00.00.0000',
        shortTitle: 'Patch Note 0.0.0',
        legacyEpigram: 'The voice behind everything. Calm. Personal.',
        body: [],
        flavorTags: ['audio', 'rare', 'reveal', 'closing'],
        unlockCondition: 'rare',
        rareUnlock: { type: 'all_other_lore_decrypted' }
    },
    {
        id: 39, chapter: 'HIDDEN', format: 'personal_log',
        classification: 'GREEN-039',
        decryptDate: 'PRE-DELETION',
        shortTitle: 'The Last Day',
        legacyEpigram: 'A father records a video for his daughter. He does not know what is coming.',
        body: [],
        flavorTags: ['intimate', 'rare'],
        unlockCondition: 'rare',
        rareUnlock: { type: 'low_hp_killing_blow' }
    },
    {
        id: 40, chapter: 'HIDDEN', format: 'field_report',
        classification: 'PROTOCOL-040',
        decryptDate: 'INTERNAL',
        shortTitle: 'Predator Identification Form',
        legacyEpigram: 'Bureaucratic paperwork classifying the operator as a Class-3 threat.',
        body: [],
        flavorTags: ['corporate', 'rare'],
        unlockCondition: 'rare',
        rareUnlock: { type: 'cumulative_kills_1000' }
    }
];

// Backwards-compat re-export. Existing call sites in game.js read from
// LORE_DATABASE as a flat string array indexed 0 through 32. They get
// the legacyEpigram of every breach-default entry, in original order,
// so the cipher grid + breach unlock flow keep working unchanged
// during the migration.
export const LORE_DATABASE = INTEL_ENTRIES
    .filter(e => e.unlockCondition === 'breach_default')
    .map(e => e.legacyEpigram);

// Lookup helper used by the modal and by game.js. Pass an entry id
// (1-based to match the visible "FILE 01" framing) and get the full
// structured entry, or null if the id is out of range.
export function getIntelEntry(id) {
    if (typeof id !== 'number' || id < 1) return null;
    return INTEL_ENTRIES.find(e => e.id === id) || null;
}

// Chapter slice helper for the cipher grid renderer. Returns the
// breach-default entries belonging to the named chapter, in id order.
// Hidden entries are excluded (they get their own panel once any are
// unlocked).
export function getChapterEntries(chapterId) {
    return INTEL_ENTRIES
        .filter(e => e.chapter === chapterId && e.unlockCondition === 'breach_default')
        .sort((a, b) => a.id - b.id);
}

// All hidden entries in id order. Used by the modal's HIDDEN section
// once at least one rare entry has been unlocked.
export function getHiddenEntries() {
    return INTEL_ENTRIES
        .filter(e => e.unlockCondition === 'rare')
        .sort((a, b) => a.id - b.id);
}
