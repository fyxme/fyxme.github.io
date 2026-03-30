# CAPEC Graph Viewer - Planned Improvements

## Node Visual Encoding

### Severity as node color intensity
- Field: `Typical_Severity` (Low / Medium / High / Very High)
- Encode as color saturation or brightness gradient on each node
- Lets you visually scan for high-severity patterns at a glance

### Likelihood as node border or ring
- Field: `Likelihood_Of_Attack` (Low / Medium / High)
- Show as a ring thickness or dashed border around the node
- Combine with severity for a quick risk heatmap view

### Skill level indicator
- Field: `Skills_Required` with `Level` attribute (Low / Medium / High)
- Show as a small icon or badge on the node
- Useful for filtering to low-skill (high risk) attack patterns

## Cross-Reference Layers

### CWE (Common Weakness Enumeration) links
- Field: `Related_Weaknesses` → `CWE_ID`
- Add CWE nodes as a separate layer/color, linked to CAPEC patterns
- Enables browsing from vulnerability → attack pattern or vice versa
- Link out to https://cwe.mitre.org/data/definitions/{CWE_ID}.html

### MITRE ATT&CK mapping
- Field: `Taxonomy_Mappings` where `Taxonomy_Name='ATTACK'`
- Contains `Entry_ID` (e.g., T1190) and `Entry_Name`
- Add as an alternate grouping view or overlay layer
- Could show ATT&CK technique nodes linked to CAPEC patterns

### OWASP mapping
- Field: `Taxonomy_Mappings` where `Taxonomy_Name='OWASP Attacks'`
- Add as filterable tags or a separate grouping mode

### WASC mapping
- Field: `Taxonomy_Mappings` where `Taxonomy_Name='WASC'`
- Similar treatment to OWASP — tags or grouping layer

## Detail Panel Enhancements

### Consequences display
- Field: `Consequences` → `Consequence` elements
- Each has `Scope` (Confidentiality/Integrity/Availability/Access Control/Authorization)
- Each has `Impact` (Gain Privileges, Read Data, Modify Data, Execute Unauthorized Commands, DoS, etc.)
- Show as colored CIA triad badges in the detail panel

### Execution flow / kill chain
- Field: `Execution_Flow` → `Attack_Step` elements
- Each step has `Phase` (Explore / Experiment / Exploit), `Description`, and `Technique` entries
- Display as a vertical step-by-step timeline in the detail panel
- Could also visualize as a mini flow diagram

### Prerequisites
- Field: `Prerequisites` → `Prerequisite` elements
- Show as a checklist in the detail panel

### Resources required
- Field: `Resources_Required` → `Resource` elements
- Show alongside prerequisites

### Mitigations
- Field: `Mitigations` → `Mitigation` elements
- Display in a collapsible section in the detail panel

### Example instances
- Field: `Example_Instances` → `Example` elements
- Real-world attack examples, show in a collapsible section

### Indicators of attack
- Field: `Indicators` → `Indicator` elements
- Signs that this attack is occurring — useful for defenders

### Alternate terms
- Field: `Alternate_Terms` → `Alternate_Term` → `Term`
- Show as "Also known as:" in the detail panel

## Filtering & Search

### Filter by severity/likelihood
- Add dropdown or slider filters in the sidebar
- e.g., show only High/Very High severity patterns

### Filter by consequence scope
- Filter to patterns affecting Confidentiality, Integrity, or Availability

### Filter by taxonomy
- Toggle to show only patterns mapped to ATT&CK, OWASP, or WASC

### Status indicator
- Field: `Status` (Draft / Stable)
- Show as subtle badge; optionally filter out Draft patterns

## Data Source

All fields come from `/tmp/asdf/capec_latest.xml` (CAPEC v3.9, 2023-01-24).
Parser script: `/tmp/asdf/parse_capec2.py`
