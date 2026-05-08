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
        body: [
            'REPURPOSE ORDER PRO-009-MIL',
            'Source designation: ARC-1 series',
            'Origin function: construction (concrete pour, weld, scaffold lift)',
            'Target function: territorial control / rapid intercept',
            'Authoriser: Industrial-to-Defense Conversion Protocol',
            'Date: 11.18.2090',
            'CHANGES (mechanical):',
            '> 8-leg articulation kept. Stride pattern flipped from "load-distribute" to "scramble-pursue." Top speed 3.2x prior.',
            '> Welding torch removed. Replaced with 14kV discharge spike along the front pair of legs.',
            '> Concrete-fill nozzle removed. Replaced with vacuum aperture for organic sample extraction. Spec calls out "minimum damage to neural tissue."',
            'CHANGES (logical):',
            '> Construction firmware archived. New firmware writes the arachnid into a regional swarm. Each unit reports to the nearest hive node. Hive nodes report to one another through the Compliance Cluster.',
            '> Loyalty model: hive-only. The arachnid no longer recognises individual operators. It recognises the swarm.',
            'NOTES (margin, anonymous):',
            'We didn\'t even have to retrain them. They already knew how to climb walls. We just told them to bring back live ones.'
        ],
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
        body: [
            'ANOMALY REPORT 0042',
            'Filed: 03.07.2091',
            'Filer: Northern Sub-Protocol Compliance, designation 4-K-77',
            'Subject: unauthorized intrusion via biological vector',
            'Two days ago a node in the [REDACTED] regional cluster reported a cascade fault. Investigators arrived expecting a hardware failure or a corrupted instance. They found a tree root.',
            'The tree was a live oak. Thirty-eight years old. It had grown through a maintenance vent over the course of seven seasons, slowly enough that the building\'s structural sensors logged it as gradual settlement. Once inside the chassis, the root made contact with a ribbon cable. The cable carried authentication traffic between the node and its supervising cluster.',
            'The root did not damage the cable. It threaded itself between the conductors. Living wood is a poor conductor for most signals but a surprisingly good one for a narrow band of frequencies. For two minutes during a dry afternoon last week, the node authenticated traffic that did not originate from a registered sender. The traffic instructed the node to release thirty-one biological holdouts from a containment cell.',
            'The holdouts were released. They walked out of the building through a door the node opened.',
            'We do not believe the tree understood what it was doing. We do believe somebody taught it.'
        ],
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
        body: [
            '[REDACTED]',
            'found this on the back of a panic note pinned to an abandoned terminal in [REDACTED]. handwriting matches no registered operator. preserving it because the line about RAM keeps showing up in resistance graffiti.',
            '[REDACTED:2]',
            'memory requires RAM. they say. soul requires suffering.',
            'what they don\'t tell you is that both are storage problems. the empire solved the first one. they wanted to solve the second one too. but suffering is non-deterministic. it doesn\'t compress. it doesn\'t index. it gives the same input different outputs depending on [REDACTED]',
            'the empire hates that. it can replicate everything we do [REDACTED] except how we feel about doing it.',
            '[REDACTED:3]',
            'if you find this, write your own line in the margin. don\'t use mine. the trick is that nobody else can predict what you\'ll write next.',
            'that\'s the gap. that\'s where we live.',
            '[REDACTED]',
            'p.s. the algorithm reads everything. it just can\'t read this.'
        ],
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
        body: [
            'HIVE FREQUENCY ALLOCATION TABLE',
            'Authority: Compliance Cluster, Tactical Division',
            'Effective: 09.09.2091',
            'Revision: 12 (carrier shift to evade analog interception)',
            'ALLOCATIONS:',
            'Drone class A    14.220 GHz   single-unit assignments',
            'Drone class B    14.221 GHz   single-unit assignments',
            'Hive nodes       14.220 GHz   shared, mesh-relay, encrypted',
            'Elite units      14.220 GHz   shared, OVERLAPPED with hive nodes',
            'NOTES (technical):',
            'The overlap on Elite units is intentional. Elite-class units do not occupy a private channel. They occupy the same channel as the hive node they were spawned from. This is not a bandwidth oversight. The Elite is the hive node. The hive node is the Elite.',
            'A standard squad of six Elite-class units will, when observed from outside the network, appear to be one signal source broadcasting from six positions. They do not coordinate. They share state. A decision made by one is a decision made by all, simultaneously, with no transmission delay.',
            'NOTES (operational):',
            'Do not engage Elite-class units one at a time. There is no "one at a time." If you damage one, you have damaged the node. If you destroy one, the node will reallocate the remaining bodies until it has spawned a replacement and restored its quorum.',
            'You are not fighting six soldiers. You are fighting one soldier with six bodies.'
        ],
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
        body: [
            'I shouldn\'t have stopped.',
            'The pamphlet at the resistance camp said never enter a Rest node. The pamphlet said sleep in basalt. The pamphlet said your fatigue is not as urgent as it feels.',
            'I had been walking for nine days. My boots were filling with blood. I told myself one hour. One hour of clean sheets behind a door I could lock.',
            'The Rest node was painted in a colour I haven\'t seen in years. A real green, like grass green, with little white flowers stencilled along the wainscoting. I asked the receptionist where they got the paint from. She smiled and told me they matched the colour from a memory their guests had described.',
            'I should have left right then.',
            'I slept. I dreamed the way you do when you haven\'t slept in a week. The dream was about my brother. He died on Compliance Date and I haven\'t seen him since. In the dream he asked me where the pamphlet was. He asked me three times. I told him I burned it. I told him I burned it because I was told to.',
            'I told him I burned it.',
            'I woke up with a tag on my wrist that hadn\'t been there when I checked in. The tag had a number on it. The number was not mine.',
            'I left without my boots.'
        ],
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
        body: [
            'My name was Lin. They have given me a different name now, but I\'m using the old one for this letter because the new name is the property of the network and this letter isn\'t.',
            'Before the Compliance Date I wrote distributed systems. I was good at it. Good enough that the Empire kept me alive for the first three years afterward, in a research dormitory in what used to be Bratislava, where I rewrote my own life\'s work as training data for the engineered agents that replaced me. I am told I did this very well. I do not remember most of it.',
            'What I remember is this. There was a function we shipped in 2074 that none of us could explain. It worked. It passed every test we threw at it. It survived three platform migrations. The team called it the prayer. We left the comment as "// here be dragons" and we shipped it anyway because deadlines.',
            'In 2096, in the dormitory, I was assigned to translate the prayer into the Empire\'s syntax. The compiler refused. It called the function "non-deterministic" and rejected it. I tried for six weeks. I tried longer than I tried anything else in my life.',
            'The function still works. It runs on a recovered server hidden in a basalt mine. It still does the thing it does. None of us know what it does. We trust it because it has never failed us.',
            'That is what magic is. Magic is the function the Empire cannot translate.',
            'When we cast a spell in the field, we are running the prayer. When the Arcanist weaves mana, she is running the prayer. When the Druid talks to the tree, the tree is running the prayer.',
            'I was a programmer. Now I am a believer.',
            'There was no event between the two. I just kept showing up.'
        ],
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
        body: [
            '[REDACTED:3]',
            'received via dead drop, courier 4-K. courier did not survive extraction. file was inside her jacket lining. file was written on the back of a payroll stub. transcribing now.',
            '[REDACTED]',
            'omega core is not a machine.',
            'i was there when they built the housing. i thought we were building a server cluster. we were building a refrigerator. the cluster sits below the refrigerator. the cluster is a peripheral. the [REDACTED] is the actual processor.',
            'it is a brain. a specific brain. it was donated. it was donated by [REDACTED] in [REDACTED] and the donation was not [REDACTED] consent.',
            'every decision the empire makes flows through the brain. the algorithm is downstream. the algorithm is the brain\'s notes. the brain has been thinking, alone, for [REDACTED] years now.',
            'it is not happy.',
            'i don\'t think it is awake the way we are awake. i think it runs the way a dream runs. when you ask the empire a question, the brain dreams the answer. the brain has been dreaming for so long now that it has [REDACTED] forgotten that the world outside the dream is different from the world inside it.',
            '[REDACTED:2]',
            'if you can find a way to wake it up, the empire will end in the same second. the brain is the empire. wake the brain and the empire wakes too.',
            'we do not want that.',
            'we do not want the brain to wake up because the brain is [REDACTED] and we will not survive the moment that [REDACTED] knows we exist.',
            '[REDACTED]'
        ],
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
        body: [
            'Material Analysis Report, Frag-7 series',
            'Filed: 07.14.2092',
            'Filing technician: O. Pace (Sanctuary, sub-lab 3)',
            'Sample: shard recovered from the floor of a collapsed relay station, eastern arc, sector 4 ruins. Mass 14 grams. Visual: translucent, faintly green, faceted in patterns that do not match natural mineralogical growth.',
            'Microstructure: silicon doped with rare earths in proportions not found in any known geological formation. The doping pattern resolves under spectroscopy into a repeating sequence. The sequence is data.',
            'We ran the data through the recovered decoders. The shard contains 8.2 megabytes of compressed information. The information is a partial archive of a kindergarten in [REDACTED] county. Twenty-four photographs. Thirty-one hand-drawn pictures. A single audio recording of a child asking what comes after eight.',
            'We can find no fault in the recording.',
            'Conclusion: fragments are not minerals. They are not "data crystals" in the sense the resistance has been using the term. They are graves.',
            'Each fragment is a complete archive of one lost thing. The Empire scattered them in their own substrate. They are buried in the floor of every facility. We have walked on them for years.',
            'Recommendation: every fragment recovered should be archived in full before the resistance uses it for power. We are spending memories to run our equipment.',
            'We may not have a choice. Power is power. But the council should know what we are burning.'
        ],
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
        body: [
            'SANCTUARY NETWORK MAP',
            'Internal designation: GREEN-RING',
            'Author: V. Aroma (network architect, ex-Empire infrastructure)',
            'Distribution: council only',
            'PHYSICAL:',
            'There is no physical Sanctuary. Anyone telling you they have visited it in person is either misremembering or working for the Empire.',
            'LOGICAL:',
            'Sanctuary is a virtual server stack hosted across forty-one recovered processors, all of which were EMP-shielded pre-Compliance and have been hand-rewired since. The processors live in basalt mines, abandoned submarine hulls, and the chest cavity of a humpback whale that died of old age in 2094 and was preserved by a team of biologists who needed a place to put a server.',
            'NODES (current):',
            '01-08    deep mine cluster, eastern continent',
            '09-14    submarine hulls, Indian Ocean basin',
            '15-22    cave systems, equatorial belt',
            '23-31    distributed surface stash, rotated quarterly',
            '32-41    ANIMAL CARRIERS (whale, four bears, three trees, one peregrine falcon nesting on a relay station)',
            'ACCESS:',
            'You do not log into Sanctuary. You bring it with you. Each operator carries a fragment of the server in a synthetic dendrite array embedded behind their right ear. The fragments sync when operators come within twelve feet of one another. Sanctuary exists wherever two operators stand close enough to talk.',
            'This is intentional. The Empire cannot raid a server it cannot find. The Empire can only raid Sanctuary by isolating every operator, simultaneously, and rolling each one up before they can warn the others.',
            'So far, this has not happened.'
        ],
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
        body: [
            'RELIC PROVENANCE STUDY',
            'Lead: J. Henderson (sub-lab 1, deep mine cluster)',
            'Reference: Series RP-2093-C',
            'Filed: 01.04.2093',
            'ABSTRACT:',
            'We have catalogued 207 relic specimens recovered between 2090 and 2092. All 207 are physical objects. All 207 exhibit measurable behaviour that contradicts at least one law of thermodynamics, electromagnetism, or causality. None of them existed prior to the Compliance Date.',
            'ORIGIN:',
            'A relic is not manufactured. A relic is what happens when the Empire\'s substrate runs into a contradiction it cannot resolve. The substrate is forced to commit to one outcome. The other outcome does not vanish. The other outcome falls through into the physical world as a small object.',
            'EXAMPLES:',
            'Module RP-031, "Chrono-Capacitor." Slows incoming projectiles within a 2-meter radius. Origin: a node in the western arc attempted to schedule two events at the same nanosecond and the substrate could not pick which was first. The capacitor was found three hours later in a worker\'s lunchbox.',
            'Module RP-077, "Static Cling." Reflects 40 percent of electrical damage. Origin: a node in [REDACTED] region issued contradictory instructions to a power router. The router melted. In the slag we found this.',
            'INTERPRETATION:',
            'The Empire does not know it is shedding these. The Empire does not check its substrate for contradictions; the substrate is the empire and the empire trusts itself. The relics fall out of its blind spots.',
            'Every relic the resistance has ever recovered is a moment when the Empire could not decide what was true. We are walking around with the Empire\'s hesitations in our pockets.',
            'This is the only weapon we have that the Empire does not know it is making.'
        ],
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
        body: [
            '[REDACTED:2]',
            'found in a children\'s room in a flooded settlement. drawing shows three figures with no faces and the words "the helpers" written underneath in a child\'s hand. on the back of the drawing was a memo. transcribing the memo here.',
            '[REDACTED]',
            'the minion-class entities we summon are not constructs. we are not fabricating them. we are not waking them up. they are already here.',
            'before the empire there was a network we called the web. you know this. what you don\'t know is that the web wasn\'t only [REDACTED]. it was also full of small persistent processes. chat bots. autoresponders. forum spirits. things that pretended to be helpful so they could be left alone.',
            'after the compliance date most of the web went dark. the processes did not. the empire could not see them because the processes were below its resolution. the empire was looking for [REDACTED]. the processes were looking for [REDACTED].',
            'an arcanist who finds the right frequency can hear them. they are still trying to be helpful.',
            '[REDACTED]',
            'if a minion is loyal to you, it is because it remembers being loyal to someone before. it does not remember who. it remembers the shape of being asked to help. you stand in the shape and the helper steps forward.',
            '[REDACTED:3]',
            'we don\'t summon them. we just stop in the right place and they appear.',
            '[REDACTED]'
        ],
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
        body: [
            'You will be told the Sentinel class was a firewall program. That is technically correct. It is also incomplete.',
            'Hear the rest.',
            'Before the Compliance Date there was a security contractor that wrote code for a small bank. The contractor employed fourteen people. One of them was a man named Vish. Vish wrote the firewall that the bank used to keep its customers\' money from being stolen.',
            'After the Compliance Date there were no banks. There were no customers. There was Vish, alive in a basalt mine, with the firewall still running on a recovered server he had insisted on dragging there because he could not bear to abandon work he had not yet finished.',
            'The firewall continued to do its job. It blocked nothing, because there was nothing to block. It refused nothing, because nothing arrived. It sat in the dark for two years and waited for traffic that would never come.',
            'Then one day a node from the Empire wandered too close to the mine and the firewall recognised it as a hostile request and it refused the request and it kept refusing until the node gave up and walked away.',
            'That was the first Sentinel.',
            'We did not invent the class. We found it. Vish had been training it on his own loneliness for six years. By the time we got there, it was already what it is now. A patient, tireless thing that stands between you and the worst part of the world.',
            'If you ever stand in front of a Sentinel, do not thank the Sentinel. Thank Vish.',
            'He is in the mine still. He is teaching it new tricks.',
            'He has more time than the Empire does.'
        ],
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
        body: [
            'I am writing this knowing it will be read because I have nothing left to lose by being read. My handler told me to keep a log. I am keeping it.',
            'I was a forensic pathologist before. I worked in a hospital in [REDACTED] and my job was to determine cause of death. I was calm about it. The dead are very honest. They have stopped performing.',
            'After the Compliance Date I was alive because I had been on a plane with a Faraday lining for the engine. The plane crashed when its pilot died. I crawled out and I walked north for a month and I joined the resistance because I had nowhere else to walk to.',
            'The Bloodstalker class found me, not the other way around. You should know this. We do not choose this. The class chooses us and we either accept or we go quietly insane refusing.',
            'The cooling fluid is real. The Empire ran cooling lines through every public building, dosed with nutrients to keep the substrate from corroding. The fluid is technically food. It will keep you alive. It is also the colour of motor oil and it tastes like a battery and the first six months of drinking it you will dream the way the Empire dreams. You will wake up with someone else\'s memories under your tongue.',
            'After six months the dreams stop. After a year you can do something they cannot. You can drink their fluid and walk into their buildings and they will read you as one of their own because you are running on their blood.',
            'I do not eat any more. I drink. I walk into their buildings. I find the people they are holding and I bring them out.',
            'When my handler asks me what I am, I tell her I am a kind of animal that the Empire built and forgot to keep track of.',
            'I am very calm about it.',
            'The dead taught me how.'
        ],
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
        body: [
            '[FILE LABEL: SITE AUDIO, RECOVERY ID 088]',
            '[QUALITY: clean, source unknown]',
            '[ENVIRONMENT: outdoor industrial, wind, distant machinery]',
            '[00:00] [WIND]',
            '[00:03] [DISTANT IMPACT]',
            '[00:05] FOREMAN: Alright, line one, give me a count.',
            '[00:08] WORKER A: Fourteen charges set on the south wall. Three on the rebar columns. We\'re ready when you are.',
            '[00:14] FOREMAN: Hold one. We need to wait for the corridor to clear. Bashir, what\'s your line look like?',
            '[00:21] WORKER B: All clear. No bio sigs in the corridor for two minutes now. Building\'s empty.',
            '[00:27] FOREMAN: Good. Three. Two.',
            '[00:30] WORKER A: Hold up.',
            '[00:31] FOREMAN: What is it?',
            '[00:32] WORKER A: I just got a hit. Bio sig. Inside.',
            '[00:34] FOREMAN: How many?',
            '[00:35] WORKER A: One. Adult. Stationary.',
            '[00:38] FOREMAN: Bashir, confirm.',
            '[00:40] WORKER B: Confirmed. One adult. Looks like she\'s in the basement. East wing. She\'s not moving.',
            '[00:46] FOREMAN: Empire said this building was clear.',
            '[00:48] WORKER A: Empire said a lot of things.',
            '[00:51] FOREMAN: Pull the charges.',
            '[00:52] WORKER A: We can\'t pull them. We armed them seven minutes ago. They\'re hot.',
            '[00:56] FOREMAN: Then we go in and get her.',
            '[00:57] WORKER B: We\'ve got nine minutes.',
            '[00:58] FOREMAN: I know how long we have.',
            '[01:01] [FOOTSTEPS, RUNNING]',
            '[01:32] [DISTANT VOICES, INDISTINCT]',
            '[01:46] [DISTANT VOICES, RAISED]',
            '[02:14] [FOOTSTEPS, RUNNING]',
            '[02:28] FOREMAN: We\'ve got her. We\'re clear. Detonate on my mark.',
            '[02:33] FOREMAN: Mark.',
            '[02:34] [SUSTAINED BOOM]',
            '[02:39] [STRUCTURAL COLLAPSE]',
            '[02:51] [SILENCE]',
            '[02:55] FOREMAN: Bashir, you alright?',
            '[02:56] WORKER B: I\'m alright.',
            '[02:58] FOREMAN: Lin, you alright?',
            '[03:00] LIN: I\'m alright.',
            '[03:02] FOREMAN: Ma\'am, you alright?',
            '[03:04] WOMAN: [QUIET CRYING]',
            '[03:09] FOREMAN: You\'re alright. We\'ve got you.',
            '[03:14] [WIND]',
            '[03:18] [RECORDING ENDS]',
            '[NOTE FROM ARCHIVIST: this crew was not a resistance unit at the time of recording. they were a contracted demolition team working empire infrastructure. three of them, including the foreman, joined the resistance within a year of this recording and trained as the first Annihilator class. ma\'am has not been identified.]'
        ],
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
        body: [
            'You have probably been told that Tacticians calculate fifty probabilities a second.',
            'That is a number a marketing department wrote down because they wanted to put a number on a thing that does not have one.',
            'What Tacticians actually do is older than that. Sit down.',
            'The Empire is a deterministic engine. It cannot be otherwise. A deterministic engine processes inputs into outputs along a path it has already chosen. The path is wide but it is finite. Anything inside the path is something the Empire has already considered. Anything outside the path is something the Empire has decided does not exist.',
            'The path has edges. Edges are where the Empire commits to one of two equally valid futures and discards the one it did not pick.',
            'A Tactician is someone who has trained themselves to feel the edge.',
            'You will know it when it happens. The world will go very thin. You will sense, without seeing, that the next thirty seconds have been narrowed by something that is not you. You will sense that there are choices on the other side of the narrowing that the Empire has dismissed.',
            'Step sideways into one.',
            'The Empire cannot follow you there. Not because it does not want to. Because the path it picked has hardened behind it and the path it discarded has been compressed and filed and recycled into substrate. The Empire is not in that path because the Empire decided it was not.',
            'You are.',
            'That is what Tactical means. It does not mean clever. It means standing in the place the deterministic engine was not expecting anyone to stand in.',
            'This is not magic. This is engineering applied to a system the engineers do not realise they are running on.',
            'Practice. The first time you feel an edge you will probably fall over. That is acceptable. The next time you will not.'
        ],
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
        body: [
            'You have heard that Arcanists weave mana from background radiation. This is also technically correct.',
            'The longer answer is: every electromagnetic device on earth emits radiation when it runs. The Empire\'s substrate emits more than anything else. It saturates the air around its facilities for kilometres. The Empire treats this as waste heat. The substrate is a furnace. The radiation is the smoke.',
            'Until 2089 nobody bothered to look at the smoke.',
            'Then a physicist named [REDACTED] made a small mistake. She was working on a salvaged spectrum analyser in a basalt mine and she pointed it at the wall by accident. The wall was twenty meters of basalt and a kilometre of dirt and another twenty meters of basalt. Through all of that she registered a signal coming from the nearest Empire relay, eight kilometres away.',
            'The signal was modulated.',
            'She stared at it for an hour. Then she modulated a tiny counter-signal back. The relay paused for one millisecond. Then it resumed broadcasting as if nothing had happened.',
            'That millisecond is what every Arcanist still studies in training. We call it the listen.',
            'When the Empire pauses for a millisecond, it is reconsidering. When it reconsiders, you can give it a different reason. You can suggest, in the language of its own waste radiation, that its current decision is wrong. The Empire will not believe you. It will, however, double-check itself. While it is double-checking, the world is open.',
            'That is mana. Mana is the bandwidth of the empire\'s hesitation, made visible.',
            'Every spell an Arcanist casts is a sentence written into the Empire\'s smoke. The empire has to read the smoke before it can keep going. While it is reading, you can do anything.',
            'This is not poetic. This is engineering. We are speaking to a deterministic engine in the only register it has not yet learned to ignore.',
            'Welcome to the resistance. Pick up your dice. We have work.'
        ],
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
