import xml.etree.ElementTree as ET
import json

ns = {'capec': 'http://capec.mitre.org/capec-3'}

tree = ET.parse('capec_latest.xml')
root = tree.getroot()

nodes = []
edges = []
seen_ids = set()

# Parse Attack Patterns
for ap in root.findall('.//capec:Attack_Pattern', ns):
    pid = ap.get('ID')
    name = ap.get('Name')
    abstraction = ap.get('Abstraction', '').lower()
    status = ap.get('Status', '')
    if status == 'Deprecated' or status == 'Obsolete':
        continue

    type_map = {'meta': 'meta', 'standard': 'standard', 'detailed': 'detailed'}
    ntype = type_map.get(abstraction, 'standard')
    nodes.append({'id': pid, 'name': name, 'type': ntype})
    seen_ids.add(pid)

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
    if status == 'Deprecated' or status == 'Obsolete':
        continue
    nodes.append({'id': cid, 'name': name, 'type': 'category'})
    seen_ids.add(cid)

    for member in cat.findall('.//capec:Has_Member', ns):
        target = member.get('CAPEC_ID')
        edges.append({'s': cid, 't': target, 'r': 'HasMember'})

# Parse Views
for view in root.findall('.//capec:View', ns):
    vid = view.get('ID')
    name = view.get('Name')
    status = view.get('Status', '')
    if status == 'Deprecated' or status == 'Obsolete':
        continue
    nodes.append({'id': vid, 'name': name, 'type': 'view'})
    seen_ids.add(vid)

    for member in view.findall('.//capec:Has_Member', ns):
        target = member.get('CAPEC_ID')
        edges.append({'s': vid, 't': target, 'r': 'HasMember'})

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

# Check for XSS
xss = [n for n in nodes if 'xss' in n['name'].lower() or 'cross-site scripting' in n['name'].lower() or 'cross site scripting' in n['name'].lower()]
print(f"XSS patterns: {xss}")

with open('capec_full.json', 'w') as f:
    json.dump({'nodes': nodes, 'edges': deduped}, f)
