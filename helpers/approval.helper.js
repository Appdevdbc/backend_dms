/**
 * Approval Helper Functions
 * Transform between flat database structure and nested JSON structure
 */

/**
 * Transform flat database row to nested JSON structure
 * @param {Object} dbRow - Database row from mst_approval
 * @returns {Object} - Nested JSON structure
 */
export function transformApprovalToJSON(dbRow) {
  return {
    app_id: dbRow.app_id,
    app_kode: dbRow.app_kode,
    app_bu_id: dbRow.app_bu_id,
    app_jns_trans: dbRow.app_jns_trans,
    app_prioritas: dbRow.app_prioritas,
    bag1: {
      type: dbRow.app_bag1 || 0,
      levels: extractLevels(dbRow, 'bag1')
    },
    bag2: {
      type: dbRow.app_bag2 || 0,
      levels: extractLevels(dbRow, 'bag2')
    },
    bag3: {
      type: dbRow.app_bag3 || 0,
      levels: extractLevels(dbRow, 'bag3')
    }
  };
}

/**
 * Transform nested JSON to flat database structure
 * @param {Object} json - Nested JSON structure
 * @returns {Object} - Flat database structure
 */
export function transformJSONToApproval(json) {
  const flat = {
    app_bu_id: json.app_bu_id,
    app_jns_trans: String(json.app_jns_trans),
    app_prioritas: json.app_prioritas,
    app_bag1: String(json.bag1?.type || 0),
    app_bag2: String(json.bag2?.type || 0),
    app_bag3: String(json.bag3?.type || 0)
  };
  
  // Flatten bag1 levels
  if (json.bag1?.levels) {
    flattenLevels(flat, json.bag1.levels, 'bag1');
  }
  
  // Flatten bag2 levels
  if (json.bag2?.levels) {
    flattenLevels(flat, json.bag2.levels, 'bag2');
  }
  
  // Flatten bag3 levels
  if (json.bag3?.levels) {
    flattenLevels(flat, json.bag3.levels, 'bag3');
  }
  
  return flat;
}

/**
 * Extract levels from flat database structure
 * @param {Object} dbRow - Database row
 * @param {String} bagName - Bag name (bag1, bag2, bag3)
 * @returns {Array} - Array of level objects
 */
function extractLevels(dbRow, bagName) {
  const levels = [];
  
  for (let i = 1; i <= 5; i++) {
    const nik = dbRow[`app_${bagName}_nik_id${i}`];
    const empId = dbRow[`app_${bagName}_emp_id${i}`];
    const desc = dbRow[`app_${bagName}_ket${i}`];
    
    if (nik || empId) {
      levels.push({
        level: i,
        nik: nik || null,
        emp_id: empId || null,
        description: desc || null
      });
    }
  }
  
  return levels;
}

/**
 * Flatten levels array to database columns
 * @param {Object} flat - Flat object to populate
 * @param {Array} levels - Array of level objects
 * @param {String} bagName - Bag name (bag1, bag2, bag3)
 */
function flattenLevels(flat, levels, bagName) {
  // Initialize all levels to null
  for (let i = 1; i <= 5; i++) {
    flat[`app_${bagName}_nik_id${i}`] = null;
    flat[`app_${bagName}_emp_id${i}`] = null;
    flat[`app_${bagName}_ket${i}`] = null;
  }
  
  // Populate provided levels
  levels.forEach((level, index) => {
    const num = index + 1;
    if (num <= 5 && level.combined) {
      flat[`app_${bagName}_nik_id${num}`] = level.combined.account_nik || level.nik || null;
      flat[`app_${bagName}_emp_id${num}`] = level.combined.account_username || level.emp_id || null;
      flat[`app_${bagName}_ket${num}`] = level.description || null;
    }
  });
}

/**
 * Format approval for list display
 * @param {Object} dbRow - Database row with joins
 * @returns {Object} - Formatted object for list
 */
export function formatApprovalForList(dbRow) {
  return {
    app_id: dbRow.app_id,
    app_kode: dbRow.app_kode,
    app_prioritas: dbRow.app_prioritas,
    bu_id: dbRow.app_bu_id,
    bu_name: dbRow.bu_name || dbRow.app_bu_id,
    app_jns_desc: dbRow.app_jns_desc || dbRow.app_jns_trans,
    app_jns_trans: dbRow.app_jns_trans,
    app_bag1: dbRow.app_bag1 === 1 ? 'Arsiparis Lokasi' : 'Corporate Legal',
    app_bag2: dbRow.app_bag2 === 1 ? 'Arsiparis Lokasi' : 'Corporate Legal',
    app_bag3: dbRow.app_bag3 === 1 ? 'Arsiparis Lokasi' : 'Corporate Legal'
  };
}
