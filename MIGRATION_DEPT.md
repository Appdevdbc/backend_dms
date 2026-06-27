# Migration Documentation: Department File Browser (`/dept`)

## Overview
Successfully migrated the legacy PHP department file browser to the modern Vue.js/Node.js stack. This module allows users to browse documents organized in a hierarchical folder structure within departments.

**Migration Date**: June 27, 2026  
**Status**: ✅ Complete

---

## Route Structure

### Legacy PHP Routes
```
/dept/{dept_seo}
/dept/{dept_seo}/{folder_seo}
/dept/{dept_seo}/{folder_seo}/{subfolder1_seo}
/dept/{dept_seo}/{folder_seo}/{subfolder1_seo}/{subfolder2_seo}
```

### New Routes

**Frontend Routes:**
- New: `/transaction/dept/:deptSeo/:folderSeo?/:subfolder1Seo?/:subfolder2Seo?`
- Backward Compatibility Redirect: `/dept/*` → `/transaction/dept/*`

**Backend API:**
- `GET /getDeptFiles` - Get department files with folder navigation

---

## Features

### 1. **Hierarchical Navigation**
- 4-level folder hierarchy: Department → Folder → Subfolder1 → Subfolder2
- Dynamic breadcrumb navigation showing current path
- Sidebar folder list showing available folders at current level
- "ALL" link to view all documents in department

### 2. **Access Control**
- User-based folder access via `mAkses` table
- Only shows folders user has permission to view
- Document filtering based on user folder access

### 3. **Document Display**
- Paginated document table with server-side filtering
- Columns: No Dokumen, Nama Dokumen, Revisi, Tanggal Pengesahan, Tanggal Terbit, Folder, Status, Download
- Status badge (Aktif/Non-Aktif)
- Only shows active documents (`content_active = 1`)
- Only shows effective documents (`content_eff_date <= current_date`)

### 4. **Search & Filter**
- Real-time search across document number, name, and folder
- Configurable rows per page (5, 10, 25, 50, 100)
- Column sorting support

### 5. **File Download**
- Direct download button for each document
- Opens file in new tab via FTP URL

---

## Database Schema

### Tables Used

**mDept** - Departments
- `dept_id` (PK)
- `dept_name`
- `dept_seo` - SEO-friendly URL segment

**mFolder** - Main folders
- `folder_id` (PK)
- `folder_name`
- `folder_seo`
- `folder_iddept` (FK to mDept)

**mFolder1** - Subfolders Level 1
- `subfolder1_id` (PK)
- `subfolder1_name`
- `subfolder1_seo`
- `subfolder1_idfolder` (FK to mFolder)
- `subfolder1_iddept` (FK to mDept)

**mFolder2** - Subfolders Level 2
- `subfolder2_id` (PK)
- `subfolder2_name`
- `subfolder2_seo`
- `subfolder2_idfolder` (FK to mFolder)
- `subfolder2_idsubfolder1` (FK to mFolder1)
- `subfolder2_iddept` (FK to mDept)

**mContent** - Documents
- `content_id` (PK)
- `content_no` - Document number
- `content_name` - Document name
- `content_revision` - Revision number
- `content_entry_date` - Approval date
- `content_eff_date` - Effective/publish date
- `content_iddept` (FK to mDept)
- `content_idfolder` (FK to mFolder)
- `content_idsubfolder1` (FK to mFolder1)
- `content_idsubfolder2` (FK to mFolder2)
- `content_file` - File path
- `content_active` - Status (1=active, 0=inactive)
- `deleted_at` - Soft delete timestamp

**mAkses** - User access control
- `akses_user` (FK to user_id)
- `akses_folder` (FK to folder_id)

---

## API Endpoint

### GET `/getDeptFiles`

**Query Parameters:**
- `deptSeo` (required) - Department SEO slug
- `folderSeo` (optional) - Folder SEO slug
- `subfolder1Seo` (optional) - Subfolder1 SEO slug
- `subfolder2Seo` (optional) - Subfolder2 SEO slug
- `filter` (optional) - Search term
- `page` (optional) - Page number (default: 1)
- `rowsPerPage` (optional) - Items per page (default: 10)
- `sortBy` (optional) - Sort column (default: content_no)
- `descending` (optional) - Sort direction (true/false)

**Response:**
```json
{
  "deptName": "string",
  "folderName": "string | null",
  "subfolder1Name": "string | null",
  "subfolder2Name": "string | null",
  "folders": [
    {
      "id": "number",
      "name": "string",
      "seo": "string",
      "type": "folder | subfolder1 | subfolder2"
    }
  ],
  "documents": {
    "data": [
      {
        "content_id": "number",
        "content_no": "string",
        "content_name": "string",
        "content_revision": "number",
        "content_entry_date": "string",
        "content_eff_date": "string",
        "content_file": "string",
        "content_active": "number",
        "folder_name": "string"
      }
    ],
    "pagination": {
      "total": "number",
      "perPage": "number",
      "currentPage": "number",
      "lastPage": "number"
    }
  }
}
```

---

## Implementation Details

### Backend Logic Flow

1. **Validate & Lookup Department**
   - Lookup department by `dept_seo`
   - Return 404 if not found

2. **Determine Navigation Level**
   - No folder: Level 1 - Show main folders
   - Folder only: Level 2 - Show subfolder1s
   - Folder + subfolder1: Level 3 - Show subfolder2s
   - Folder + subfolder1 + subfolder2: Level 4 - Final level (no more folders)

3. **Apply Access Control**
   - Filter folders via `mAkses` join
   - Only show folders user has access to

4. **Query Documents**
   - Filter by department
   - Filter by folder hierarchy (if specified)
   - Filter by active status (`content_active = 1`)
   - Filter by effective date (`content_eff_date <= CURDATE()`)
   - Filter by user access (via `mAkses` join)
   - Apply search filter (if provided)
   - Apply pagination

### Frontend Navigation Logic

1. **Route Watching**
   - Component watches route params (`deptSeo`, `folderSeo`, etc.)
   - Reloads data when any param changes

2. **Folder Navigation**
   - "ALL" button → Reset to department level
   - Folder click → Navigate to appropriate level
   - Maintains proper URL path structure

3. **Breadcrumb Display**
   - Shows current navigation path
   - Department → Folder → Subfolder1 → Subfolder2

---

## Files Modified/Created

### Backend
- ✅ Created: `dms-be/controllers/Transaction/deptController.js`
- ✅ Modified: `dms-be/router/transaction.js`

### Frontend
- ✅ Created: `dms-fe/src/pages/Transaction/Dept.vue`
- ✅ Modified: `dms-fe/src/routes/transaction.js`
- ✅ Modified: `dms-fe/src/routes/router.js` (backward compatibility redirect)

### Documentation
- ✅ Created: `dms-be/MIGRATION_DEPT.md`

---

## Testing Checklist

- [ ] Navigate to department (level 1)
- [ ] Click "ALL" to see all department documents
- [ ] Click folder to navigate to level 2
- [ ] Click subfolder1 to navigate to level 3
- [ ] Click subfolder2 to navigate to level 4
- [ ] Verify breadcrumb updates correctly
- [ ] Verify folder sidebar updates at each level
- [ ] Test document search/filter
- [ ] Test pagination
- [ ] Test column sorting
- [ ] Test document download
- [ ] Verify only user-accessible folders appear
- [ ] Verify only active documents appear
- [ ] Verify only effective documents appear (content_eff_date <= today)
- [ ] Test backward compatibility redirect from `/dept/*` to `/transaction/dept/*`
- [ ] Test access from department menu link

---

## Legacy PHP Reference

**View File:** `dms-old/application/views/file.php`  
**Model:** `dms-old/application/models/Model_User.php`
- `get_folder_bydept($iddept, $iduser)`
- `get_content_bydept($iddept, $idfolder, $idsubfolder1, $idsubfolder2, $iduser)`

---

## Notes

1. **Access Control**: The module respects user folder permissions via `mAkses` table, ensuring users only see folders and documents they have access to.

2. **Soft Deletes**: Documents with `deleted_at` set are excluded from results.

3. **Effective Date Filter**: Only documents with `content_eff_date <= current_date` are shown (similar to legacy behavior).

4. **SEO URLs**: Uses SEO-friendly slugs (`dept_seo`, `folder_seo`, etc.) instead of numeric IDs for clean URLs.

5. **Download Path**: Documents are downloaded via FTP URL configured in `VITE_FTP_URL` environment variable.

6. **Type Indicator**: Folders in sidebar include a `type` field (`folder`, `subfolder1`, `subfolder2`) to help frontend determine navigation path.

---

## Environment Variables

```env
VITE_FTP_URL=http://your-ftp-server.com/path
```

---

## Future Enhancements

- [ ] Add folder upload functionality
- [ ] Add document preview modal
- [ ] Add bulk download option
- [ ] Add document history/revision tracking
- [ ] Add favorite folders feature
- [ ] Add recent documents section
- [ ] Improve mobile responsiveness
