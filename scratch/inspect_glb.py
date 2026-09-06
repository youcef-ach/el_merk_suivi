import struct, json

path = '/var/lib/docker/volumes/app_miniodata/_data/virtual-inspections/inspections/3d7fa359-641e-481f-9687-2e39d1c292cb/model.glb/9714fdc6-572f-45cc-9247-9d0068be1b7f/part.1'
with open(path, 'rb') as f:
    header = f.read(20)
    print('Header hex:', header.hex())
    f.seek(0)
    magic = f.read(4)
    print('Magic:', magic)
    if magic == b'glTF':
        version, length = struct.unpack('<II', f.read(8))
        chunk_len, chunk_type = struct.unpack('<I4s', f.read(8))
        print('Version:', version, 'Length:', length, 'Chunk len:', chunk_len, 'Chunk type:', chunk_type)
        json_data = json.loads(f.read(chunk_len).decode('utf-8'))
        pos_accessors = [a for a in json_data.get('accessors', []) if 'min' in a and len(a['min']) == 3]
        all_min = [min(a['min'][i] for a in pos_accessors) for i in range(3)]
        all_max = [max(a['max'][i] for a in pos_accessors) for i in range(3)]
        print('Model Bounding Box Min:', all_min)
        print('Model Bounding Box Max:', all_max)
        print('Model Size:', [all_max[i] - all_min[i] for i in range(3)])
        nodes = json_data.get('nodes', [])
        print('Nodes count:', len(nodes))
        for i, n in enumerate(nodes[:5]):
            print(f'Node {i}:', {k: n[k] for k in n if k in ('matrix', 'rotation', 'translation', 'scale', 'mesh')})
