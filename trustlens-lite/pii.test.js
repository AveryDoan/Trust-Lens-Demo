import assert from 'node:assert/strict';
import { scanPii, summarizeFindings } from './pii.js';

// [name, input, expected finding types in order]
const cases = [
  ['email', 'Mail jane.doe+work@example.com.au today', ['email']],
  ['mobile spaced', 'Call 0412 345 678 now', ['phone']],
  ['mobile compact', 'Call 0412345678 now', ['phone']],
  ['mobile +61', 'Call +61 412 345 678 now', ['phone']],
  ['mobile +61 compact', 'Call +61412345678 now', ['phone']],
  ['mobile dashes', 'Call 0412-345-678 now', ['phone']],
  ['landline brackets', 'Office (02) 9876 5432', ['phone']],
  ['landline plain', 'Office 03 9876 5432', ['phone']],
  ['landline +61', 'Office +61 7 3876 5432', ['phone']],
  ['TFN spaced', 'TFN 123 456 782', ['tfn']],
  ['TFN compact', 'TFN 123456782', ['tfn']],
  ['card spaced', 'Card 4111 1111 1111 1111 expires soon', ['card']],
  ['card dashes', 'Card 4111-1111-1111-1111', ['card']],
  ['card 15 digit (Amex)', 'Amex 378282246310005', ['card']],
  ['card 13 digit', 'Visa 4222222222222', ['card']],
  ['all four together', 'jane@example.com, 0412 345 678, TFN 123 456 782, card 4111 1111 1111 1111', ['email', 'phone', 'tfn', 'card']],
  ['two phones', 'Ring 0412 345 678 or 02 9876 5432', ['phone', 'phone']],
  ['DOB written out', 'My date of birth is 3 July 1981 thanks', ['dob']],
  ['DOB with slashes', 'DOB: 03/07/1981', ['dob']],
  ['born on', 'Elena was born on 3 July 1981.', ['dob']],
  ['home address with suburb, state and postcode', 'I live at 14 Quarry Lane, Harbourview NSW 2999 now', ['address']],
  ['address without suburb', 'Send it to 22 Station Road please', ['address']],
  ['DOB and address together', 'my date of birth is 3 July 1981 and my home address is 14 Quarry Lane, Harbourview NSW 2999.', ['dob', 'address']],
  // false positives: none of these should be masked
  ['date slashes', 'Due 15/03/2024', []],
  ['date ISO', 'Created 2024-03-15 10:30', []],
  ['order number 8 digits', 'Order #48213907 shipped', []],
  ['invoice number', 'Invoice INV-2024-0001234 attached', []],
  ['9-digit order, bad TFN checksum', 'Order 123456789 shipped', []],
  ['16 digits failing Luhn', 'Ref 4111 1111 1111 1112', []],
  ['money', 'Total $1,234,567.89', []],
  ['version and plain prose', 'Release v1.2.3 fixed 12 bugs', []],
  ['not an email', 'Meet @ 5pm, cost @ $10', []],
  ['ABN placeholder with zeros is not a TFN', 'ABN 00 000 000 000', []],
  ['ordinary date, no birth context', 'Invoice date 25 September 2026, due 9/10/2026', []],
  ['road word without a street number', 'Take the Main Road to the lane', []],
];

let failed = 0;
for (const [name, input, expected] of cases) {
  try {
    const { maskedText, findings } = scanPii(input);
    assert.deepEqual(findings.map((f) => f.type), expected);
    for (const f of findings) {
      assert.deepEqual(Object.keys(f).sort(), ['end', 'start', 'type']); // no original value stored
      const original = input.slice(f.start, f.end);
      assert.ok(!maskedText.includes(original), `masked text still contains "${original}"`);
    }
    if (expected.length === 0) assert.equal(maskedText, input);
    console.log('ok   ', name);
  } catch (err) {
    failed++;
    console.log('FAIL ', name, '-', err.message);
  }
}

// token output and summary line
try {
  const { maskedText, findings } = scanPii('Mail a@b.co or 0412 345 678 or 02 9876 5432');
  assert.equal(maskedText, 'Mail [EMAIL] or [PHONE] or [PHONE]');
  assert.equal(summarizeFindings(findings), '3 items masked: 1 email, 2 phone');
  assert.equal(summarizeFindings([]), 'No personal data found to mask.');
  console.log('ok    tokens and summary');
} catch (err) {
  failed++;
  console.log('FAIL  tokens and summary -', err.message);
}

console.log(failed ? `\n${failed} failed` : `\nall ${cases.length + 1} passed`);
process.exit(failed ? 1 : 0);
