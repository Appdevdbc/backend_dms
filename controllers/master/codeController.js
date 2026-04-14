import dayjs from "dayjs";
import { dbDMS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";

export const listCodeMaster = async (req, res) => {
      // #swagger.tags = ['Code']
    /* #swagger.security = [{
                "bearerAuth": []
        }] */
    // #swagger.description = 'Fungsi untuk menampilkan list data code'
    try {
        const { rowsPerPage, descending, sortBy, page, filter,domain } = req.query;
        const baseQuery = dbDMS("mst_code").whereNull('deleted_at');
        if (!rowsPerPage) {
            baseQuery.select('code_id','code_field','code_value','code_varchar01',
            'code_varchar02','code_boolean01','code_boolean02',
            'code_int01','code_int02','code_dec01','code_dec02','code_status')
            .where('code_status','active');
            
            if (req.query.domain) {
                baseQuery.where('code_domain',domain);
            }
            if (req.query.limit) {
                baseQuery.limit(req.query.limit);
            }
            if (req.query.field) {
                baseQuery.where('code_field',req.query.field);
            }
            if (req.query.values) {
                baseQuery.where('code_value',req.query.values);
            }
            if (req.query.boolsatu) {
                baseQuery.where('code_boolean01',req.query.boolsatu);
            }
            if (req.query.order) {
                baseQuery.orderBy(req.query.order);
            }else{
                baseQuery.orderBy("code_field");
            }
            const response=await baseQuery
            return res.status(200).json(response);
        }
        const sorting = descending === 'true' ? 'desc' : 'asc';
        const columnSort = sortBy === 'asc' ? 'code_field asc' : `${sortBy} ${sorting}`;
        const currentPage = Math.floor(page);
        const perPage = Math.floor(rowsPerPage);
        let query = baseQuery
            .select('code_id','code_field','code_value','code_varchar01',
            'code_varchar02','code_boolean01','code_boolean02',
            'code_int01','code_int02','code_dec01','code_dec02','code_status')
            .where((subQuery) => {
                subQuery
                    .where('code_domain', domain)
                    .orWhereNull('code_domain')
            });
        
        // Apply filter if provided
        if (filter) {
            query = query.where((subQuery) => {
            subQuery
                .orWhere('code_field', 'like', `%${filter}%`)
                .orWhere('code_value', 'like', `%${filter}%`)
                .orWhere('code_varchar01', 'like', `%${filter}%`)
                .orWhere('code_varchar02', 'like', `%${filter}%`)
                .orWhere('code_status', 'like', `%${filter}%`)

            });
        }

        const response = await query
            .orderByRaw(columnSort)
            .paginate({
            perPage,
            currentPage,
            isLengthAware: true,
            });
        
        for (const data of response.data) {
            data.code_id=await encrypt(`${data.code_id}`);
        }
        res.status(200).json(response);
    } catch (error) {
        logger(error, 'GET /listCodeMaster', req.query);
        return res.status(406).json(getErrorResponse(error))
    }
};
        
export const saveCodeMaster = async (req, res) => {
      // #swagger.tags = ['Code']
    /* #swagger.security = [{
                "bearerAuth": []
        }] */
    // #swagger.description = 'Fungsi untuk menyimpan data code'
    const trx = await dbDMS.transaction();
    try {
        
        const { bydomain,domain,field,values,exchar1,exchar2,exbool1,exbool2,exint1_raw,exint2_raw,exdec1_raw,exdec2_raw, status,id: encryptedId, creator: encryptedCreator } = req.body;
        
        const decodedExchar1 = exchar1 ? decodeURIComponent(exchar1) : null;
        const decodedExchar2 = exchar2 ? decodeURIComponent(exchar2) : null;
        
        console.log('Raw exchar1:', exchar1);
        console.log('Decoded exchar1:', decodedExchar1);
        
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
        const id = encryptedId ? decrypt(encryptedId) : '0';
        const creator = decrypt(encryptedCreator);
        
        const data = {
            code_domain: bydomain?domain:null,
            code_field: field,
            code_value:values,
            code_varchar01:decodedExchar1,
            code_varchar02:decodedExchar2,
            code_boolean01:exbool1,
            code_boolean02:exbool2,
            code_int01:exint1_raw,
            code_int02:exint2_raw,
            code_dec01:exdec1_raw,
            code_dec02:exdec2_raw,
            code_status:status,
            updated_by: creator,
            updated_at: now,
        }; 
    
        let action=null,dataString=null;
        // Check if code already exists
        let existingCodeQuery = trx("mst_code")
            .where("code_field", field)
            .where("code_value", values)
            .where('code_id', '<>', id);
        
        if (data.code_domain) {
            existingCodeQuery = existingCodeQuery.where('code_domain', data.code_domain);
        }
        
        const existingCode = await existingCodeQuery.first();
        
        if (!existingCode && id === '0') {
            // Insert new code
            await trx("mst_code").insert({...data,created_by:creator,created_at:now});
        } else if (!existingCode) {
            // Update existing code
            await trx("mst_code").where("code_id", id).update(data);
        } else {
            // Handle existing code conflicts
            if (existingCode.deleted_at === null && parseInt(existingCode.code_id) !== parseInt(id)) {
                await trx.rollback();
                return res.status(406).json({type:'error',message:`Code sudah ada, silahkan Coba Lagi`});
            } else if (existingCode.deleted_at !== null) {
                // Restore deleted code
                let restoreQuery = trx("mst_code").where("code_field", field).where("code_value", values);
                if (data.code_domain) {
                    restoreQuery = restoreQuery.where('code_domain', data.code_domain);
                }
                await restoreQuery.update({...data,deleted_by:null,deleted_at:null});
            }
        }
        await trx.commit();
        return res.json("sukses");
    } catch (error) {
        await trx.rollback();
        logger(error, 'POST /saveCodeMaster', req.body);
        return res.status(406).json(getErrorResponse(error));
    }
}