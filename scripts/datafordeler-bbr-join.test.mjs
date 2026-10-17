import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeBbr, createCsvParser, findPointHeader } from './datafordeler-bbr-join.mjs';

function parse(chunks, delimiter) {
  const rows = [];
  const parser = createCsvParser((row) => rows.push(row), delimiter);
  for (const chunk of chunks) parser.write(chunk);
  parser.end();
  return rows;
}

test('csv parser handles quotes, doubled quotes, embedded newlines and CRLF', () => {
  const rows = parse(['a,"b,c","d ""x"" y"\r\n1,"two\nlines",3\n']);
  assert.deepEqual(rows, [['a', 'b,c', 'd "x" y'], ['1', 'two\nlines', '3']]);
});

test('csv parser gives the same rows whatever the chunk boundaries are', () => {
  const text = '"h1","h2"\r\n"a ""q"" b","c,d"\r\n"","x"\r\n';
  const whole = parse([text]);
  for (let size = 1; size <= 7; size++) {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
    assert.deepEqual(parse(chunks), whole, `chunk size ${size}`);
  }
  assert.deepEqual(whole[1], ['a "q" b', 'c,d']);
  assert.deepEqual(whole[2], ['', 'x']);
});

test('csv parser keeps a last row without a trailing newline and skips empty input', () => {
  assert.deepEqual(parse(['a,b\n1,2']), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parse(['']), []);
});

const tables = () => ({
  rel: [
    { id_lokalId: 'R1', bfeNummer: '100', ejendomstype: '1', samletFastEjendom: '100', ejerlejlighed: '' },
    { id_lokalId: 'R2', bfeNummer: '200', ejendomstype: '3', samletFastEjendom: '', ejerlejlighed: '200' },
  ],
  grund: [{ id_lokalId: 'G1', bestemtFastEjendom: 'R1', husnummer: 'H1' }, { id_lokalId: 'G2', bestemtFastEjendom: 'zzz', husnummer: '' }],
  bygning: [
    { id_lokalId: 'B1', grund: 'G1', byg021BygningensAnvendelse: '120', 'byg026Opførelsesår': '1999', byg039BygningensSamledeBoligAreal: '176', point: 'POINT (1 2)' },
    { id_lokalId: 'B2', grund: 'G1', byg021BygningensAnvendelse: '120', 'byg026Opførelsesår': '', byg039BygningensSamledeBoligAreal: '', point: '' },
    { id_lokalId: 'B3', grund: 'G2', byg021BygningensAnvendelse: '130', 'byg026Opførelsesår': '1980', byg039BygningensSamledeBoligAreal: '90', point: 'POINT (3 4)' },
    { id_lokalId: 'B4', grund: 'G1', byg021BygningensAnvendelse: '910', 'byg026Opførelsesår': '1950', byg039BygningensSamledeBoligAreal: '0', point: '' },
  ],
  enhed: [
    { id_lokalId: 'E1', enh020EnhedensAnvendelse: '140', enh027ArealTilBeboelse: '85' },
    { id_lokalId: 'E2', enh020EnhedensAnvendelse: '140', enh027ArealTilBeboelse: '' },
    { id_lokalId: 'E3', enh020EnhedensAnvendelse: '140', enh027ArealTilBeboelse: '60' },
  ],
  enhedRel: [{ ejerlejlighed: 'R2', enhed: 'E1' }, { ejerlejlighed: 'nope', enhed: 'E3' }],
});

test('analyzeBbr resolves houses and apartments to a BFE and scores the join hypotheses', () => {
  const report = analyzeBbr(tables());
  assert.deepEqual(report.houses, { buildings: 3, withBfe: 2, withLivingArea: 1, withBuiltYear: 1, withPoint: 1, distinctBfe: 1, bfeWithOneHouse: 0 });
  assert.equal(report.apartments.residentialUnits, 2);
  assert.equal(report.apartments.withBfe, 1);
  assert.deepEqual(report.apartments.ejendomstypeOfLinkedRelation, [['3', 1]]);
  assert.equal(report.hypotheses['Grund.bestemtFastEjendom in Ejendomsrelation.id_lokalId'], '1/2 (50.0%)');
  assert.equal(report.hypotheses['EnhedEjendomsrelation.ejerlejlighed in Ejendomsrelation.id_lokalId'], '1/2 (50.0%)');
  assert.equal(report.hypotheses['EnhedEjendomsrelation.ejerlejlighed in Ejendomsrelation.bfeNummer'], '0/2 (0.0%)');
  assert.equal(report.example.length, 2);
});

test('analyzeBbr also accepts a join that goes through the BFE number instead of the relation id', () => {
  const t = tables();
  t.grund = [{ id_lokalId: 'G1', bestemtFastEjendom: '100', husnummer: '' }];
  const report = analyzeBbr(t);
  assert.equal(report.houses.withBfe, 2);
  assert.equal(report.hypotheses['Grund.bestemtFastEjendom in Ejendomsrelation.bfeNummer'], '1/1 (100.0%)');
});

test('findPointHeader prefers the exact coordinate column over similarly named code columns', () => {
  const header = ['id_lokalId', 'byg133KildeTilKoordinatsæt', 'byg404Koordinat', 'byg406Koordinatsystem'];
  assert.equal(findPointHeader(header), 2);
  assert.equal(findPointHeader(['id', 'position']), 1);
  assert.equal(findPointHeader(['id', 'byg133KildeTilKoordinatsæt']), -1);
});
