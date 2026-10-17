import assert from 'node:assert/strict';
import test from 'node:test';
import { describeSdlFields, extractSdlTypes, findFileRows, pickFile, pickFolded, summarizeListing } from './discover-datafordeler.mjs';

const row = (over = {}) => ({
  Filename: 'BBR_V1_Bygning_TotalDownload_json_current_851_20261017.zip',
  EntityName: 'Bygning',
  TypeOfDownload: 'Totaldownload',
  TypeOfData: 'Current',
  MunicipalityCode: '851',
  GenerationNumber: 12,
  GenerationTime: '2026-10-17T04:00:00Z',
  ExpirationDate: '2026-10-24T04:00:00Z',
  FileSizeInBytes: null,
  OutputFileFormat: 'JSON',
  ...over,
});

test('findFileRows finds the file array under a documented key or any object array', () => {
  const rows = [row()];
  assert.equal(findFileRows({ AvailableFileDownloads: rows }), rows);
  assert.equal(findFileRows({ something: rows }), rows);
  assert.equal(findFileRows(rows), rows);
  assert.deepEqual(findFileRows({ PaginationMetadata: {} }), []);
  assert.deepEqual(findFileRows(null), []);
});

test('summarizeListing keeps relevant entities and prefers municipality 851', () => {
  const s = summarizeListing({
    PaginationMetadata: { TotalPages: 3 },
    AvailableFileDownloads: [
      row(),
      row({ MunicipalityCode: '101', Filename: 'other.zip' }),
      row({ EntityName: 'TekniskAnlaeg', Filename: 'irrelevant.zip' }),
      row({ EntityName: 'Ejendomsrelation', MunicipalityCode: '0851', Filename: 'rel.zip' }),
    ],
  });
  assert.equal(s.total, 4);
  assert.equal(s.municipalRows, 2);
  assert.deepEqual(s.picked.map((p) => p.file), ['BBR_V1_Bygning_TotalDownload_json_current_851_20261017.zip', 'rel.zip']);
  assert.deepEqual(s.pagination, { TotalPages: 3 });
});

test('summarizeListing falls back to all relevant rows when no municipality matches and reads casing loosely', () => {
  const s = summarizeListing([{ filename: 'a.zip', entityname: 'BBR_Grund', municipalitycode: null }]);
  assert.equal(s.municipalRows, 0);
  assert.equal(s.picked.length, 1);
  assert.equal(s.picked[0].file, 'a.zip');
});

const file = (over = {}) => ({
  fileName: 'BBR_V3_Ejendomsrelation_0851_TotalDownload_csv_Current_784.zip',
  entityName: 'Ejendomsrelation',
  typeOfDownload: 'TotalDownload',
  typeOfData: 'Current',
  municipalityCode: '0851',
  generationNumber: 784,
  fileSizeInBytes: 8_031_792,
  ...over,
});

test('pickFile takes the newest matching csv for the municipality', () => {
  const rows = [
    file({ generationNumber: 778, fileName: 'old_csv_778.zip' }),
    file(),
    file({ fileName: 'x_json_784.zip', generationNumber: 999 }),
    file({ municipalityCode: '0101', generationNumber: 999 }),
    file({ typeOfData: 'Bitemporal', generationNumber: 999 }),
  ];
  assert.equal(pickFile(rows, { entity: 'Ejendomsrelation', municipality: '0851' }).generationNumber, 784);
});

test('pickFile skips files that are too big or too small and returns null without a match', () => {
  const big = file({ fileSizeInBytes: 3_772_912_778 });
  assert.equal(pickFile([big], { entity: 'Ejendomsrelation', municipality: '0851' }), null);
  const empty = file({ typeOfDownload: 'DeltaDownload', typeOfData: 'Bitemporal', fileSizeInBytes: 234, fileName: 'd_csv_1.zip' });
  assert.equal(pickFile([empty], { entity: 'Ejendomsrelation', download: 'DeltaDownload', data: 'Bitemporal', minBytes: 5000 }), null);
  assert.equal(pickFile([], { entity: 'Grund' }), null);
});

test('extractSdlTypes returns field lines per type and null for missing types', () => {
  const sdl = 'type BBR_Grund implements Node {\n  id_lokalId: String\n  # note\n  bestemtFastEjendom: BFE\n}\ntype Other { a: Int }';
  const out = extractSdlTypes(sdl, ['BBR_Grund', 'BBR_Missing']);
  assert.deepEqual(out.BBR_Grund, ['id_lokalId: String', 'bestemtFastEjendom: BFE']);
  assert.equal(out.BBR_Missing, null);
});

const sdl = [
  'type EJF_Handelsoplysninger implements Node {',
  '  "Grunddatamodel info:',
  '    type: Float',
  '    multiplicity: 0..1',
  '    definition (da): samlet koebesum',
  '  "',
  '  samletKoebesum: Float @cost(weight: "1")',
  '    type: DateTime',
  '  koebsaftaledato: LocalDate @cost(weight: "1")',
  '  list(first: Int): [String!] @cost(weight: "2")',
  '}',
  'type Other { a: Int }',
].join('\n');

test('describeSdlFields lists every field with type and definition and ignores description lines', () => {
  const fields = describeSdlFields(sdl, 'EJF_Handelsoplysninger');
  assert.deepEqual(fields.map((f) => `${f.name}:${f.type}`), ['samletKoebesum:Float', 'koebsaftaledato:LocalDate', 'list:[String!]']);
  assert.equal(fields[0].definition, 'samlet koebesum');
  assert.equal(fields[1].definition, '');
  assert.equal(describeSdlFields(sdl, 'Missing'), null);
});

test('pickFolded prefers an exact folded match and falls back to a prefix', () => {
  const names = ['ejendomvaerdiBeloeb', 'grundvaerdiBeloeb', 'aar', 'aarsag'];
  assert.equal(pickFolded(names, 'aar'), 'aar');
  assert.equal(pickFolded(names, 'ejendomsvaerdibeloeb', 'ejendomvaerdibeloeb'), 'ejendomvaerdiBeloeb');
  assert.equal(pickFolded(names, 'grundvaerdi'), 'grundvaerdiBeloeb');
  assert.equal(pickFolded(names, 'findesikke'), null);
});
