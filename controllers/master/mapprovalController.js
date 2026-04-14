import { dbDMS } from "../../config/db.js";
import dayjs from "dayjs";
import * as dotenv from 'dotenv';
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
dotenv.config();

export const listApproval = async (req, res) => {
  try {
    const sorting = req.query.descending === "true" ? "desc" : "asc";
    const columnSort = req.query.sortBy === "desc" ? "app_kode asc" : `${req.query.sortBy} ${sorting}`;
    const page = Math.floor(req.query.page);
    
    const response = await dbDMS('mst_approval as a')
      .select(
        'a.app_id',
        'a.app_kode',
        'a.app_prioritas',
        'a.app_bu_id',
        'b.bu_name',
        'c.app_jns_desc',
        'a.app_jns_trans',
        dbDMS.raw("case when a.app_bag1 = 1 then 'Arsiparis Lokasi' else 'Corporate Legal' end as app_bag1"),
        dbDMS.raw("case when a.app_bag2 = 1 then 'Arsiparis Lokasi' else 'Corporate Legal' end as app_bag2"),
        dbDMS.raw("case when a.app_bag3 = 1 then 'Arsiparis Lokasi' else 'Corporate Legal' end as app_bag3")
      )
      .innerJoin('v_mstr_bu as b', function() {
        this.on('a.app_bu_id', '=', 'b.bu_id');
      })
      .innerJoin('mst_approval_jenis as c', 'a.app_jns_trans', 'c.app_jns_id')
      .where((query) => {
        if (req.query.bu_id) {
          query.where('a.app_bu_id', req.query.bu_id);
        }
        if (req.query.filter) {
          query.where(function() {
            this.orWhere('a.app_kode', 'like', `%${req.query.filter}%`)
              .orWhere('b.bu_name', 'like', `%${req.query.filter}%`)
              .orWhere('c.app_jns_desc', 'like', `%${req.query.filter}%`)
              .orWhere('a.app_prioritas', 'like', `%${req.query.filter}%`);
          });
        }
      })
      .orderByRaw(columnSort)
      .paginate({
        perPage: Math.floor(req.query.rowsPerPage),
        currentPage: page,
       