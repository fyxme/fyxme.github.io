import xml.etree.ElementTree as ET
import json, re

ns = {'capec': 'http://capec.mitre.org/capec-3'}
tree = ET.parse('capec_latest.xml')
root = tree.getroot()

nodes = []
edges = []
seen_ids = set()

# Collect all attack patterns first (need for implicit view resolution)
all_patterns = {}  # id -> {name, abstraction, status, taxonomies}
for ap in root.findall('.//capec:Attack_Pattern', ns):
    pid = ap.get('ID')
    name = ap.get('Name')
    abstraction = ap.get('Abstraction', '')
    status = ap.get('Status', '')

    # Collect taxonomy mappings
    taxonomies = set()
    for tm in ap.findall('.//capec:Taxonomy_Mapping', ns):
        taxonomies.add(tm.get('Taxonomy_Name', ''))

    all_patterns[pid] = {
        'name': name, 'abstraction': abstraction,
        'status': status, 'taxonomies': taxonomies
    }

# Parse Attack Patterns into nodes/edges
for pid, info in all_patterns.items():
    if info['status'] in ('Deprecated', 'Obsolete'):
        continue

    type_map = {'Meta': 'meta', 'Standard': 'standard', 'Detailed': 'detailed'}
    ntype = type_map.get(info['abstraction'], 'standard')
    nodes.append({'id': pid, 'name': info['name'], 'type': ntype})
    seen_ids.add(pid)

# Parse relationships from Attack Patterns
for ap in root.findall('.//capec:Attack_Pattern', ns):
    pid = ap.get('ID')
    if pid not in seen_ids:
        continue
    for rel in ap.findall('.//capec:Related_Attack_Pattern', ns):
        nature = rel.get('Nature')
        target = rel.get('CAPEC_ID')
        if nature == 'ChildOf':
            edges.append({'s': target, 't': pid, 'r': 'ChildOf'})
        elif nature == 'CanPrecede':
            edges.append({'s': pid, 't': target, 'r': 'CanPrecede'})
        elif nature == 'PeerOf':
            edges.append({'s': pid, 't': target, 'r': 'PeerOf'})

# Parse Categories
for cat in root.findall('.//capec:Category', ns):
    cid = cat.get('ID')
    name = cat.get('Name')
    status = cat.get('Status', '')
    if status in ('Deprecated', 'Obsolete'):
        continue
    nodes.append({'id': cid, 'name': name, 'type': 'category'})
    seen_ids.add(cid)
    for member in cat.findall('.//capec:Has_Member', ns):
        target = member.get('CAPEC_ID')
        edges.append({'s': cid, 't': target, 'r': 'HasMember'})

# Parse Views - handle both explicit and implicit
for view in root.findall('.//capec:View', ns):
    vid = view.get('ID')
    name = view.get('Name')
    status = view.get('Status', '')
    vtype = view.get('Type', '')
    if status in ('Deprecated', 'Obsolete'):
        continue

    nodes.append({'id': vid, 'name': name, 'type': 'view'})
    seen_ids.add(vid)

    # Explicit members
    for member in view.findall('.//capec:Has_Member', ns):
        target = member.get('CAPEC_ID')
        edges.append({'s': vid, 't': target, 'r': 'HasMember'})

    # Resolve implicit filters
    filt_el = view.find('.//capec:Filter', ns)
    if filt_el is not None and filt_el.text:
        filt = filt_el.text

        # Match by abstraction level
        m = re.search(r"@Abstraction='(\w+)'", filt)
        if m:
            level = m.group(1)
            for pid, info in all_patterns.items():
                if info['abstraction'] == level and info['status'] not in ('Deprecated', 'Obsolete') and pid in seen_ids:
                    edges.append({'s': vid, 't': pid, 'r': 'HasMember'})

        # Match by taxonomy mapping
        m = re.search(r"@Taxonomy_Name='([^']+)'", filt)
        if m:
            tax_name = m.group(1)
            for pid, info in all_patterns.items():
                if tax_name in info['taxonomies'] and info['status'] not in ('Deprecated', 'Obsolete') and pid in seen_ids:
                    edges.append({'s': vid, 't': pid, 'r': 'HasMember'})

        # Match by explicit ID list (e.g., Mobile Device Patterns)
        m = re.search(r'@ID\s*=\s*\(([^)]+)\)', filt)
        if m:
            ids = [x.strip() for x in m.group(1).split(',')]
            for pid in ids:
                if pid in seen_ids:
                    edges.append({'s': vid, 't': pid, 'r': 'HasMember'})

        # Comprehensive view (all non-deprecated patterns + categories)
        if 'not(self::External_References)' in filt:
            for pid in seen_ids:
                n = next((n for n in nodes if n['id'] == pid), None)
                if n and n['type'] != 'view':
                    edges.append({'s': vid, 't': pid, 'r': 'HasMember'})

# Filter edges to only include nodes we have
edges = [e for e in edges if e['s'] in seen_ids and e['t'] in seen_ids]

# Deduplicate edges
edge_set = set()
deduped = []
for e in edges:
    key = (e['s'], e['t'], e['r'])
    if key not in edge_set:
        edge_set.add(key)
        deduped.append(e)

print(f"Nodes: {len(nodes)}, Edges: {len(deduped)}")
print(f"Types: { {t: sum(1 for n in nodes if n['type']==t) for t in ['view','category','meta','standard','detailed']} }")

# Check 283 edges
edges_283 = [e for e in deduped if e['s'] == '283' or e['t'] == '283']
print(f"CAPEC-283 edges: {len(edges_283)}")
if edges_283[:5]:
    for e in edges_283[:5]:
        print(f"  {e}")

with open('capec_full.json', 'w') as f:
    json.dump({'nodes': nodes, 'edges': deduped}, f)
