import assert from 'node:assert/strict';
import test from 'node:test';
import { findFileRows, summarizeListing } from './discover-datafordeler.mjs';

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
