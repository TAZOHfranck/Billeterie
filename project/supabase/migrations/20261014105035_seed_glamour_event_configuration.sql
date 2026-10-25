/*
# Configure Soirée Chic & Glamour event

1. Modified Data
- Updates the existing event settings row with the event title, date, start time, location placeholder, programme description, and Cameroon contact numbers.
- Adds three ticket table options with the maquette's 8,000 FCFA starting price.
- Adds common Cameroon payment methods for the public reservation form.

2. Purpose
- Gives the public page and reservation flow usable event content immediately.
- Keeps all existing tickets, tables, and payment methods intact by using conditional inserts and an update only for the existing event settings row.

3. Security
- No new tables or policies are created.
- Existing RLS policies remain unchanged.

4. Important Notes
- The administrator can change every value later from the settings, tables, and payment methods screens.
- The venue remains intentionally configurable because the supplied artwork says the address is still to be communicated.
*/

UPDATE event_settings
SET
  event_name = 'Soirée Chic & Glamour',
  event_date = '2026-12-17T18:00:00+01:00',
  event_location = 'À préciser',
  event_description = 'IPD-Yaoundé présente la 2ème édition de la Soirée Chic & Glamour. Concours Miss & Master, danse, chant, interprétation, jeux et animations.',
  contact_phone = '+237 6 73 24 97 91',
  contact_email = '',
  updated_at = now()
WHERE id = (SELECT id FROM event_settings ORDER BY created_at ASC LIMIT 1);

INSERT INTO tables (name, capacity, price, is_active)
SELECT 'Table Standard', 8, 8000, true
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE name = 'Table Standard');

INSERT INTO tables (name, capacity, price, is_active)
SELECT 'Table Premium', 8, 12000, true
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE name = 'Table Premium');

INSERT INTO tables (name, capacity, price, is_active)
SELECT 'Table VIP', 8, 20000, true
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE name = 'Table VIP');

INSERT INTO payment_methods (name, account_details, instructions, is_active)
SELECT 'Mobile Money', '+237 6 73 24 97 91', 'Effectuez le transfert puis importez la capture de confirmation.', true
WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE name = 'Mobile Money');

INSERT INTO payment_methods (name, account_details, instructions, is_active)
SELECT 'Virement bancaire', 'Coordonnées communiquées sur demande', 'Contactez l’infoline avant le paiement.', true
WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE name = 'Virement bancaire');
