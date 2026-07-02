import { dbDMS } from "../../config/db.js";
import { getErrorResponse, decrypt } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";

export const getDeptFiles = async (req, res) => {
  // #swagger.tags = ['Transaction']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get department files with folder navigation'
  try {
    const { deptSeo, folderSeo, subfolder1Seo, subfolder2Seo, filter, page, rowsPerPage, sortBy, descending, userId } = req.query;
    const actualUserId = decrypt(userId);

    if (!deptSeo) {
      return res.status(400).json({ error: 'Department SEO is required' });
    }

    // Get department info by SEO
    const dept = await dbDMS('mDept')
      .where('dept_seo', deptSeo)
      .first();

    if (!dept) {
      return res.status(404).json({ error: 'Department not found' });
    }

    let folderData = null;
    let subfolder1Data = null;
    let subfolder2Data = null;
    let folders = [];

    // Determine current navigation level and get appropriate folders
    if (!folderSeo) {
      // Level 1: Show main folders for this department
      folders = await dbDMS('mFolder')
        .select('folder_id as id', 'folder_name as name', 'folder_seo as seo')
        .where('folder_iddept', dept.dept_id)
        .whereExists(function () {
          this.select('*')
            .from('mAkses')
            .innerJoin('mUser', function () {
              this.on('mUser.user_id', '=', 'mAkses.akses_user');
            })
            .whereRaw('mAkses.akses_folder = mFolder.folder_id')
            .where('mUser.user_empid', actualUserId)
            .where('akses_folder', '>', 0);
        })
        .orderBy('folder_name', 'asc')
        .then(rows => rows.map(row => ({ ...row, type: 'folder' })));

    } else {
      // Get folder info
      folderData = await dbDMS('mFolder')
        .where('folder_seo', folderSeo)
        .where('folder_iddept', dept.dept_id)
        .first();

      if (!folderData) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      if (!subfolder1Seo) {
        // Level 2: Show subfolder1 for this folder
        folders = await dbDMS('mFolder1')
          .select('subfolder1_id as id', 'subfolder1_name as name', 'subfolder1_seo as seo')
          .where('subfolder1_idfolder', folderData.folder_id)
          .where('subfolder1_iddept', dept.dept_id)
          .orderBy('subfolder1_name', 'asc')
          .then(rows => rows.map(row => ({ ...row, type: 'subfolder1' })));

      } else {
        // Get subfolder1 info
        subfolder1Data = await dbDMS('mFolder1')
          .where('subfolder1_seo', subfolder1Seo)
          .where('subfolder1_idfolder', folderData.folder_id)
          .where('subfolder1_iddept', dept.dept_id)
          .first();

        if (!subfolder1Data) {
          return res.status(404).json({ error: 'Subfolder1 not found' });
        }

        if (!subfolder2Seo) {
          // Level 3: Show subfolder2 for this subfolder1
          folders = await dbDMS('mFolder2')
            .select('subfolder2_id as id', 'subfolder2_name as name', 'subfolder2_seo as seo')
            .where('subfolder2_idsubfolder1', subfolder1Data.subfolder1_id)
            .where('subfolder2_idfolder', folderData.folder_id)
            .where('subfolder2_iddept', dept.dept_id)
            .orderBy('subfolder2_name', 'asc')
            .then(rows => rows.map(row => ({ ...row, type: 'subfolder2' })));

        } else {
          // Get subfolder2 info
          subfolder2Data = await dbDMS('mFolder2')
            .where('subfolder2_seo', subfolder2Seo)
            .where('subfolder2_idsubfolder1', subfolder1Data.subfolder1_id)
            .where('subfolder2_idfolder', folderData.folder_id)
            .where('subfolder2_iddept', dept.dept_id)
            .first();

          if (!subfolder2Data) {
            return res.status(404).json({ error: 'Subfolder2 not found' });
          }
        }
      }
    }

    // Build document query based on current level
    const sorting = descending === "true" ? "desc" : "asc";
    const columnSort = sortBy ? `c.${sortBy} ${sorting}` : "c.content_no asc";
    const currentPage = page ? Math.floor(page) : 1;
    const perPage = rowsPerPage ? Math.floor(rowsPerPage) : 10;

    let documentQuery = dbDMS('mContent as c')
      .select(
        'c.content_id',
        'c.content_no',
        'c.content_name',
        'c.content_revision',
        'c.content_entry_date',
        'c.content_eff_date',
        'c.content_file',
        'c.content_file1',
        'c.content_active',
        'f.folder_name',
        'f1.subfolder1_name',
        'f2.subfolder2_name'
      )
      .leftJoin('mFolder as f', 'f.folder_id', 'c.content_idfolder')
      .leftJoin('mFolder1 as f1', 'f1.subfolder1_id', 'c.content_idsubfolder1')
      .leftJoin('mFolder2 as f2', 'f2.subfolder2_id', 'c.content_idsubfolder2')
      .innerJoin('mAkses as a', function () {
        this.on('a.akses_folder', '=', 'c.content_idfolder');
      })
      .innerJoin('mUser', function () {
        this.on('mUser.user_id', '=', 'a.akses_user');
      })
      .where('mUser.user_empid', actualUserId)
      .where('c.content_iddept', dept.dept_id)
      .where('c.content_active', 1)
      .where('c.content_eff_date', '<=', dbDMS.raw('GETDATE()'));

    // Log SQL query for debugging
    console.log('=== getDeptFiles Query ===');
    console.log('actualUserId:', actualUserId);
    console.log('dept_id:', dept.dept_id);
    console.log('folderData:', folderData?.folder_id);
    console.log('subfolder1Data:', subfolder1Data?.subfolder1_id);
    console.log('subfolder2Data:', subfolder2Data?.subfolder2_id);

    // Apply folder filters
    if (folderData) {
      documentQuery.where('c.content_idfolder', folderData.folder_id);
      
      // If we're at folder level (no subfolder1Seo), show documents at folder level only
      if (!subfolder1Seo || subfolder1Seo === '') {
        documentQuery.whereNull('c.content_idsubfolder1');
      }
    }

    if (subfolder1Data) {
      documentQuery.where('c.content_idsubfolder1', subfolder1Data.subfolder1_id);
      
      // If we're at subfolder1 level (no subfolder2Seo), show documents at subfolder1 level only
      if (!subfolder2Seo || subfolder2Seo === '') {
        documentQuery.whereNull('c.content_idsubfolder2');
      }
    }

    if (subfolder2Data) {
      documentQuery.where('c.content_idsubfolder2', subfolder2Data.subfolder2_id);
    }

    // Apply search filter
    if (filter) {
      documentQuery.where((query) => {
        query.orWhere("c.content_no", "like", `%${filter}%`);
        query.orWhere("c.content_name", "like", `%${filter}%`);
        query.orWhere("f.folder_name", "like", `%${filter}%`);
        query.orWhere("f1.subfolder1_name", "like", `%${filter}%`);
        query.orWhere("f2.subfolder2_name", "like", `%${filter}%`);
      });
    }

    // Log SQL query before execution
    console.log('=== SQL Query ===');
    console.log(documentQuery.toSQL().toNative());
    console.log('==================');

    // Execute paginated query
    const documents = await documentQuery
      .orderByRaw(columnSort)
      .paginate({
        perPage,
        currentPage,
        isLengthAware: true,
      });

    console.log('=== Query Result ===');
    console.log('Total documents:', documents.pagination.total);
    console.log('====================');

    res.status(200).json({
      deptName: dept.dept_name,
      folderName: folderData?.folder_name || null,
      subfolder1Name: subfolder1Data?.subfolder1_name || null,
      subfolder2Name: subfolder2Data?.subfolder2_name || null,
      folders,
      documents
    });

  } catch (error) {
    logger(error, 'GET /getDeptFiles', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
