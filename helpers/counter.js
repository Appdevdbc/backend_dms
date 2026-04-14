import { dbDMS } from "../config/db.js";

/**
 * Generate ticket number for mutasi/pemusnahan
 * Replicates PHP getnokontermutasi function
 * 
 * @param {Object} trx - Knex transaction object
 * @param {Object} params - Parameters
 * @param {string} params.arsip_kat - Category (kategori_dokumen)
 * @param {string} params.bu - Business Unit ID
 * @param {string} params.div - Division ID
 * @param {string} params.jns_trans - Transaction type ('6' = Pemusnahan, '7' = Mutasi)
 * @returns {Promise<string>} Generated ticket number
 */
export const generateTicketNumber = async (trx, params) => {
  const { arsip_kat, bu, div, jns_trans } = params;

  // Debug logging
  console.log('generateTicketNumber params:', { arsip_kat, bu, div, jns_trans });

  if (!arsip_kat || !bu || !jns_trans) {
    throw new Error('Missing required parameters for ticket generation');
  }

  // Check if counter exists for this year
  const yearCheck = await trx.raw(`
    SELECT YEAR(cnt_date) as year 
    FROM mst_counter 
    WHERE cnt_jns_trans = ? 
      AND cnt_cat_doc = ? 
      AND cnt_bu_id = ?
  `, [jns_trans, arsip_kat, bu]);

  const currentYear = new Date().getFullYear();
  const counterYear = yearCheck[0]?.year;

  // Reset counter if year changed
  if (counterYear && counterYear !== currentYear) {
    await trx.raw(`
      UPDATE mst_counter 
      SET cnt_nilai_counter = 0, cnt_date = GETDATE() 
      WHERE cnt_jns_trans = ? 
        AND cnt_cat_doc = ? 
        AND cnt_bu_id = ? 
        AND cnt_reset = 'yes'
    `, [jns_trans, arsip_kat, bu]);
  } else {
    // Increment counter
    await trx.raw(`
      UPDATE mst_counter 
      SET cnt_nilai_counter = cnt_nilai_counter + 1, cnt_date = GETDATE() 
      WHERE cnt_jns_trans = ? 
        AND cnt_cat_doc = ? 
        AND cnt_bu_id = ?
    `, [jns_trans, arsip_kat, bu]);
  }

  // Generate ticket number with format: PREFIX + NUMBER + /DIV + /BU + /YYMM
  // If div is null/undefined, the CASE statement will handle it
  const divParam = div || null;
  
  console.log('Executing ticket number query with params:', { divParam, bu, jns_trans, arsip_kat });
  
  const result = await trx.raw(`
    SELECT 
      cnt_prefix 
      + RIGHT(REPLICATE('0', 4) + CONVERT(VARCHAR(10), cnt_nilai_counter), 3)
      + CASE 
          WHEN ? IS NOT NULL AND (SELECT COUNT(div_id) total FROM v_mstr_div WHERE div_pk = ?) > 0 
          THEN '/' + (SELECT REPLACE(dbo.fn_extractupper(div_nama), ' ', '') FROM v_mstr_div WHERE div_pk = ?) 
          ELSE '' 
        END
      + '/' + (SELECT TOP 1 map_bu_singkat FROM mst_map_kode_bu WHERE map_mstr_bu_id = ?)
      + '/' + SUBSTRING(CONVERT(VARCHAR(10), YEAR(GETDATE())), 3, 2) 
      + RIGHT(REPLICATE('0', 2) + CONVERT(VARCHAR(10), MONTH(GETDATE())), 2)
      AS no_konter
    FROM mst_counter
    WHERE cnt_jns_trans = ? 
      AND cnt_cat_doc = ? 
      AND cnt_bu_id = ?
  `, [divParam, divParam, divParam, bu, jns_trans, arsip_kat, bu]);

  console.log('Query result:', result);
  console.log('Generated ticket number:', result[0]?.no_konter);
  
  if (!result || result.length === 0 || !result[0]?.no_konter) {
    console.error('No counter found for:', { jns_trans, arsip_kat, bu });
    throw new Error(`Counter tidak ditemukan untuk jenis transaksi ${jns_trans}, kategori ${arsip_kat}, BU ${bu}`);
  }
  
  return result[0].no_konter;
};
