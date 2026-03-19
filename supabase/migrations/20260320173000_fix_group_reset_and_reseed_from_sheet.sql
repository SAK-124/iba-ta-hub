-- Fix TA-side group resets and fully rebuild groups from the Spring 2026 sheet.
-- Notes:
-- - The workbook stores the first member on the same row as the group number.
-- - The workbook has two raw "Group 28" blocks and no explicit "Group 29";
--   the second raw 28 block is imported as Group 29.
-- - ERP 28204 appears twice in the workbook. Later occurrences win so the final
--   arrangement stays aligned with the bottom-most sheet assignment.

BEGIN;

CREATE OR REPLACE FUNCTION public.ta_clear_group_roster()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ta_email text;
  v_removed_members integer := 0;
  v_removed_groups integer := 0;
  v_removed_batches integer := 0;
  v_removed_sync_adjustments integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_ta_email := auth.jwt() ->> 'email';
  IF NOT public.is_ta(v_ta_email) THEN
    RAISE EXCEPTION 'Only TAs can clear the group roster';
  END IF;

  DELETE FROM public.late_day_claim_batches
  WHERE group_id IN (SELECT id FROM public.student_groups)
     OR (
       jsonb_typeof(membership_snapshot) = 'array'
       AND jsonb_array_length(membership_snapshot) > 1
     );
  GET DIAGNOSTICS v_removed_batches = ROW_COUNT;

  DELETE FROM public.late_day_adjustments
  WHERE reason LIKE 'group-shared-sync:%'
     OR reason LIKE 'group-sync-max:%';
  GET DIAGNOSTICS v_removed_sync_adjustments = ROW_COUNT;

  DELETE FROM public.student_group_members
  WHERE true;
  GET DIAGNOSTICS v_removed_members = ROW_COUNT;

  DELETE FROM public.student_groups
  WHERE true;
  GET DIAGNOSTICS v_removed_groups = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'removed_members', v_removed_members,
    'removed_groups', v_removed_groups,
    'removed_batches', v_removed_batches,
    'removed_sync_adjustments', v_removed_sync_adjustments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ta_clear_group_roster() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ta_clear_group_roster() TO authenticated;

CREATE TEMP TABLE tmp_group_sheet_seed (
  group_number integer NOT NULL,
  member_rank integer NOT NULL,
  student_erp text NOT NULL,
  student_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_group_sheet_seed (group_number, member_rank, student_erp, student_name)
VALUES
    (1, 1, '28591', 'Anumta Bawa'),
    (1, 2, '28607', 'Mohammad Shayan Aziz'),
    (1, 3, '30816', 'Bareera Siddiqui'),
    (1, 4, '30817', 'Armeen Hussain Khan'),
    (1, 5, '28701', 'Umair Khan'),
    (2, 1, '27859', 'Hamna Kashif'),
    (2, 2, '28350', 'Yusra Batool'),
    (2, 3, '26462', 'Marium Amer'),
    (2, 4, '28205', 'Alishba Atif'),
    (2, 5, '26403', 'Madiha Zaffar Karim'),
    (3, 1, '26467', 'Zayed Azim Hashimi'),
    (3, 2, '26443', 'Saad Asif Khan'),
    (3, 3, '26420', 'Fazle Akbar'),
    (3, 4, '26503', 'Minhal Kukda'),
    (4, 1, '27795', 'Bisma Syed'),
    (4, 2, '27794', 'Aleena Sangi'),
    (4, 3, '28391', 'Laraib Tameezudin'),
    (4, 4, '28089', 'Celeina Bodani'),
    (4, 5, '27828', 'Maleeha Fakih'),
    (5, 1, '30051', 'Salina Ali'),
    (5, 2, '28670', 'Danish Farukh'),
    (5, 3, '28638', 'Syed Arhab Ullah Jafri'),
    (5, 4, '28593', 'Muhammad Abrar'),
    (5, 5, '28547', 'Noor Us Saba'),
    (6, 1, '28121', 'Sameen Samad'),
    (6, 2, '28161', 'Hafsa Javed'),
    (6, 3, '28837', 'Munazza Abid'),
    (6, 4, '28289', 'Shahwaiz Butt'),
    (6, 5, '27982', 'Muhammad Hamza Ali Zaidi'),
    (7, 1, '26969', 'Abdullah Khalid'),
    (7, 2, '27140', 'Qamar Raza'),
    (7, 3, '24463', 'Muddasir javed'),
    (7, 4, '26673', 'Arham Shaikh'),
    (7, 5, '26603', 'Muhammed Ahmed'),
    (8, 1, '28237', 'Maryam Malik'),
    (8, 2, '28181', 'Simal Asad'),
    (8, 3, '28234', 'Zaitoon Saeed'),
    (8, 4, '28973', 'Hajra Maryam'),
    (8, 5, '28287', 'Muhammad Hassan Mirza'),
    (9, 1, '28285', 'Ahmed Maqbool'),
    (9, 2, '27836', 'Huzaifa Nadeem Rana'),
    (9, 3, '27835', 'Muhammad Ayan Ali'),
    (9, 4, '27870', 'Ahmed Magsi'),
    (10, 1, '28041', 'Arisha Mirza'),
    (10, 2, '28533', 'Izhan Larik'),
    (10, 3, '28099', 'Muhammad Ahmed Ayub'),
    (10, 4, '28645', 'Sana Naseem'),
    (10, 5, '29923', 'Maheen Usmany'),
    (11, 1, '31416', 'Maniba Mir'),
    (11, 2, '30924', 'Mahnoor'),
    (11, 3, '30043', 'Muskan zahid'),
    (11, 4, '29996', 'Zubaida zeenat'),
    (11, 5, '26491', 'Shaikh Zahid Raza'),
    (12, 1, '30790', 'Parshant Kumar'),
    (12, 2, '29944', 'Hassan Abbas'),
    (12, 3, '29952', 'Hasnain Yousuf'),
    (12, 4, '30071', 'Mairaj Abbas'),
    (12, 5, '31142', 'Safiya Tasleem'),
    (13, 1, '27817', 'Ahmad Tariq'),
    (13, 2, '28700', 'Inshrah Naveed'),
    (13, 3, '28838', 'Bushra Jehangir'),
    (13, 4, '28354', 'Abdul Rafay'),
    (13, 5, '28068', 'Muhammad Hassan Bin Naseem'),
    (14, 1, '30120', 'Abdullah Atta'),
    (14, 2, '28681', 'Muhammad Hasaan'),
    (14, 3, '28696', 'Hussain Ashar'),
    (14, 4, '30759', 'Ejaz Ahmad'),
    (15, 1, '28894', 'Nameera Ehtesham'),
    (15, 2, '28781', 'Nabeeha Usmani'),
    (15, 3, '28793', 'Sineha'),
    (15, 4, '28774', 'Faria Zulfiqar'),
    (15, 5, '25941', 'Dua Rias'),
    (16, 1, '29942', 'Maheen Soomro'),
    (16, 2, '29970', 'Syeda Alina Fatima Abidi'),
    (16, 3, '29108', 'Roha Asif'),
    (16, 4, '30093', 'Nabiha Fahim'),
    (16, 5, '30015', 'Muhammad Lodhi'),
    (17, 1, '24783', 'Ahmed bin Shakeel'),
    (17, 2, '28483', 'Aamina Aftab'),
    (17, 3, '28620', 'Ammar Atif'),
    (17, 4, '24985', 'Muhammad Moiz Qaiser'),
    (18, 1, '28292', 'Suman Baig'),
    (18, 2, '30111', 'Aqsa Ambreen'),
    (18, 3, '27784', 'Falak Viqar'),
    (18, 4, '28327', 'Aiman Noor'),
    (18, 5, '30742', 'Uswa Anwar'),
    (19, 1, '30878', 'Qamar Abbas'),
    (19, 2, '24406', 'Hassan Akbar Goraya'),
    (19, 3, '31389', 'Abubaker Akhtar'),
    (19, 4, '26426', 'Muhammad Haris'),
    (20, 1, '27979', 'Filza Haq'),
    (20, 2, '27978', 'Ifrah Mazhar'),
    (20, 3, '27953', 'Tamkanat Adnan'),
    (20, 4, '27977', 'Ruba Meer'),
    (20, 5, '25934', 'Hania Farhan'),
    (21, 1, '30027', 'Mohammad Zaid Imran'),
    (21, 2, '28627', 'Harmain Sarejo'),
    (21, 3, '28800', 'Ahsan Sawar'),
    (21, 4, '29338', 'Mairaj uddin'),
    (21, 5, '28116', 'Asim Hussain'),
    (22, 1, '28300', 'Sardar Zaid'),
    (22, 2, '28694', 'Shayan Ali'),
    (22, 3, '28554', 'Ahmed Faraz Khan'),
    (22, 4, '28358', 'Syed Muhammad Faizan Raza'),
    (23, 1, '28343', 'Mustafa Mirza'),
    (23, 2, '28349', 'Muhammad Azka'),
    (23, 3, '26018', 'Shahzar Abbas'),
    (23, 4, '28339', 'Aysha Khan'),
    (23, 5, '26458', 'Iraj Fatima'),
    (24, 1, '30842', 'Mehdi Nizam'),
    (24, 2, '31428', 'Mutahar Ali Shah'),
    (24, 3, '29937', 'Talha Raqib'),
    (25, 1, '27933', 'Arsalan Anjum'),
    (25, 2, '28403', 'Hassan Waseem'),
    (25, 3, '28383', 'Rabiya Aziz'),
    (25, 4, '27938', 'Khadija Abdulla'),
    (25, 5, '27821', 'Laiba Rahman'),
    (26, 1, '26268', 'Syed Hassan Abid Shah'),
    (26, 2, '24751', 'Muhammad Zainul Abedin'),
    (26, 3, '25927', 'Omaama Khan'),
    (26, 4, '26895', 'Syeda Umyma Faiz'),
    (26, 5, '28338', 'Mahnoor Fatima Shaikh'),
    (27, 1, '28204', 'Syed Munis Yezdan'),
    (27, 2, '28502', 'Faseeh ur Rehman'),
    (27, 3, '27792', 'Muhammad Talha Afzal'),
    (27, 4, '24753', 'Romail Rehman'),
    (27, 5, '24748', 'Taha Khan'),
    (28, 1, '28320', 'Hiba Nouman'),
    (28, 2, '28307', 'Armish Khan'),
    (28, 3, '31104', 'Sohaib Ali Khokhar'),
    (28, 4, '26632', 'Amnah Tariq'),
    (28, 5, '30300', 'Rayyan Sheikh'),
    (29, 1, '25884', 'Aiman Abdul Basit'),
    (29, 2, '24683', 'Abdul Rafay'),
    (29, 3, '28843', 'Jannat Tariq'),
    (29, 4, '28553', 'Hasnain Zafar'),
    (29, 5, '28102', 'Muhammad Ahmad Nadeem'),
    (30, 1, '28772', 'Manahil Essani'),
    (30, 2, '28153', 'Sanabil M.Tariq'),
    (30, 3, '27948', 'Ameena Rehan'),
    (30, 4, '27950', 'Hamna Aamer'),
    (31, 1, '28876', 'Moiz Uddin'),
    (31, 2, '28204', 'Syed Munis'),
    (31, 3, '26736', 'Muhammad Ibrahim');

DELETE FROM public.late_day_claim_batches
WHERE group_id IN (SELECT id FROM public.student_groups)
   OR (
     jsonb_typeof(membership_snapshot) = 'array'
     AND jsonb_array_length(membership_snapshot) > 1
   );

DELETE FROM public.late_day_adjustments
WHERE reason LIKE 'group-shared-sync:%'
   OR reason LIKE 'group-sync-max:%';

DELETE FROM public.student_group_members
WHERE true;

DELETE FROM public.student_groups
WHERE true;

WITH deduped_seed_rows AS (
  SELECT group_number, member_rank, student_erp, student_name
  FROM (
    SELECT
      tmp_group_sheet_seed.*,
      ROW_NUMBER() OVER (
        PARTITION BY student_erp
        ORDER BY group_number DESC, member_rank DESC
      ) AS student_erp_rank
    FROM tmp_group_sheet_seed
  ) ranked
  WHERE student_erp_rank = 1
),
eligible_seed_rows AS (
  SELECT
    deduped_seed_rows.group_number,
    deduped_seed_rows.member_rank,
    roster.erp AS student_erp,
    roster.student_name
  FROM deduped_seed_rows
  JOIN public.students_roster roster
    ON roster.erp = deduped_seed_rows.student_erp
)
INSERT INTO public.student_groups (
  group_number,
  created_by_erp,
  created_by_email,
  created_by_role,
  student_edit_locked_at
)
SELECT DISTINCT
  eligible_seed_rows.group_number,
  NULL,
  'group-sheet-import@local',
  'ta',
  now()
FROM eligible_seed_rows
ORDER BY eligible_seed_rows.group_number;

WITH deduped_seed_rows AS (
  SELECT group_number, member_rank, student_erp, student_name
  FROM (
    SELECT
      tmp_group_sheet_seed.*,
      ROW_NUMBER() OVER (
        PARTITION BY student_erp
        ORDER BY group_number DESC, member_rank DESC
      ) AS student_erp_rank
    FROM tmp_group_sheet_seed
  ) ranked
  WHERE student_erp_rank = 1
),
eligible_seed_rows AS (
  SELECT
    deduped_seed_rows.group_number,
    deduped_seed_rows.member_rank,
    roster.erp AS student_erp,
    roster.student_name
  FROM deduped_seed_rows
  JOIN public.students_roster roster
    ON roster.erp = deduped_seed_rows.student_erp
)
INSERT INTO public.student_group_members (
  group_id,
  student_erp,
  added_by_erp,
  added_by_role
)
SELECT
  existing_groups.id,
  eligible_seed_rows.student_erp,
  'group-sheet-import@local',
  'ta'
FROM eligible_seed_rows
JOIN public.student_groups AS existing_groups
  ON existing_groups.group_number = eligible_seed_rows.group_number
ORDER BY eligible_seed_rows.group_number, eligible_seed_rows.member_rank;

COMMIT;
