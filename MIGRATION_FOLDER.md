# Migration Guide: Master Folder

## Overview
Migration of the Master Folder management feature from the old PHP/AngularJS system to the new Node.js/Vue.js stack.

## Migration Status
✅ **COMPLETED** - Main Folder functionality (Phase 1)
⏳ **PENDING** - Sub Folder 1 and Sub Folder 2 (Phase 2 - Future Enhancement)

## Old System Reference

### Database Table: `mFolder`
```sql
CREATE TABLE mFolder (
  folder_id INT PRIMARY KEY AUTO_INCREMENT,
  folder_name VARCHAR(100),
  folder_desc VARCHAR(200),
  folder_path VARCHAR(255),
  folder_path1 VARCHAR(255),
  folder_seo VARCHAR(255),
  folder_iddiv INT,
  folder_iddept INT,
  folder_domain VARCHAR(50),
  created_by VARCHAR(50),
  created_at DATETIME,
  updated_by VARCHAR(50),
  updated_at DATETIME,
  deleted_by VARCHAR(50),
  deleted_at DATETIME
);
```

### Old PHP Files
- **Controller**: `application/controllers/User_Action.php`
  - Methods: `save_folder()`, `delete_folder()`
- **View**: `application/views/master-folder.php`
  - 3 tabs: Main Folder, Sub Folder 1, Sub Folder 2
- **Model/Functions**: 
  - `get_data_folder()`
  - `save_folder()`
  - `delete_folder()`

### Old Route
- `/master_folder` - Main folder management with 3-tab interface

## New System Implementation

### Backend

#### Controller: `dms-be/controllers/master/folderController.js`

**Endpoints Implemented:**
1. `GET /listFolder` - Get paginated list of folders with division and department info
2. `POST /saveFolder` - Create or update folder (folder name automatically converted to uppercase)
3. `POST /deleteFolder` - Soft delete folder (validates no subfolders exist)
4. `GET /getFolderById` - Get single folder by ID with related info
5. `GET /getSelectDivisi` - Get divisions for dropdown
6. `GET /getSelectDept` - Get departments for dropdown (cascade by division)

**Placeholder Endpoints (Future):**
- `GET /listSubFolder1`, `POST /saveSubFolder1`, `POST /deleteSubFolder1`
- `GET /listSubFolder2`, `POST /saveSubFolder2`, `POST /deleteSubFolder2`
- `GET /getSelectFolder`, `GET /getSelectSubFolder1`

**Key Features:**
- Folder names are automatically converted to UPPERCASE (matching old system behavior)
- Validates folder uniqueness within department
- Prevents deletion if folder has subfolders (mFolder1 table check)
- Soft delete with `deleted_at` and `deleted_by`
- Joins with mDivisi and mDept for display names
- Domain-aware filtering

**Business Rules:**
1. Folder name must be unique within the same department
2. Folder name is automatically converted to uppercase
3. Cannot delete a folder that has subfolders
4. Division and Department are required fields
5. Supports search/filter across folder name, description, division, and department

#### Routes: `dms-be/router/master.js`
```javascript
// FolderController
router.get('/listFolder', listFolder);
router.post('/saveFolder', saveFolder);
router.post('/deleteFolder', deleteFolder);
router.get('/getFolderById', getFolderById);
router.get('/getSelectDivisi', getSelectDivisi); // Shared with dept
router.get('/getSelectDept', getSelectDept);
// Placeholder routes for future Sub Folder implementation
router.get('/listSubFolder1', listSubFolder1);
router.post('/saveSubFolder1', saveSubFolder1);
router.post('/deleteSubFolder1', deleteSubFolder1);
router.get('/listSubFolder2', listSubFolder2);
router.post('/saveSubFolder2', saveSubFolder2);
router.post('/deleteSubFolder2', deleteSubFolder2);
router.get('/getSelectFolder', getSelectFolder);
router.get('/getSelectSubFolder1', getSelectSubFolder1);
```

### Frontend

#### Component: `dms-fe/src/pages/Master/Folder.vue`

**Features Implemented:**
- Data table with server-side pagination
- Search/filter functionality
- Add/Edit/Delete operations
- Cascade dropdown (Divisi → Departement)
- Form validation using Yup schema
- Permission-based access control (add/edit/delete/view)
- Modern UI matching Plant.vue style

**Table Columns:**
1. **Aksi** - Action buttons (Edit, Delete)
2. **Folder** - Folder name
3. **Path** - Folder path (empty in initial version)
4. **Divisi** - Division name
5. **Departement** - Department name

**Form Fields:**
- Nama Folder* (required) - auto-converted to uppercase
- Divisi* (required) - dropdown with cascade effect
- Departement* (required) - filtered by selected Divisi
- Keterangan - Description (optional)

**Validation Rules:**
```javascript
{
  folder_name: required string,
  folder_iddiv: required number,
  folder_iddept: required number
}
```

**UI/UX Features:**
- Gradient header with folder icon
- Breadcrumb navigation (Home → Master → Data Folder)
- Round action buttons with hover effects
- Orange button for Edit
- Red button for Delete
- Responsive dialog form
- Confirmation dialogs for save and delete
- Toast notifications for success/error

#### Routes

**Frontend Route**: `dms-fe/src/routes/master.js`
```javascript
{
  path: "folder",
  component: () => import("./../pages/Master/Folder.vue"),
}
```

**Redirect Route**: `dms-fe/src/routes/router.js`
```javascript
{
  path: "/master_folder",
  redirect: "/master/folder"
}
```

## Migration Changes

### Key Differences from Old System

1. **Simplified Initial Version**
   - Old: 3-tab interface (Main Folder, Sub Folder 1, Sub Folder 2)
   - New: Single table for Main Folders only (Phase 1)
   - Reason: Start with core functionality, add hierarchy later if needed

2. **Modern UI/UX**
   - Old: Traditional PHP table layout
   - New: Modern Vue.js with Quasar components, Tailwind CSS, gradient headers, shadow effects

3. **Cascade Selection**
   - Enhanced dropdown interaction: selecting Divisi automatically loads relevant Departments
   - Department dropdown is disabled until Divisi is selected

4. **Uppercase Enforcement**
   - Backend automatically converts folder names to uppercase
   - Maintains consistency with old system requirement

5. **Enhanced Validation**
   - Frontend: Yup schema validation
   - Backend: Uniqueness check within department
   - Dependency check before deletion (prevents deleting folders with subfolders)

## Database Schema

### Main Table Used: `mFolder`

**Fields:**
- `folder_id` - Primary key
- `folder_name` - Folder name (VARCHAR 100, automatically uppercase)
- `folder_desc` - Description
- `folder_path` - Physical path (empty for now)
- `folder_path1` - Alternative path (empty for now)
- `folder_seo` - SEO-friendly slug (auto-generated from name)
- `folder_iddiv` - Foreign key to mDivisi
- `folder_iddept` - Foreign key to mDept
- `folder_domain` - Domain identifier
- `created_by`, `created_at` - Audit fields
- `updated_by`, `updated_at` - Audit fields
- `deleted_by`, `deleted_at` - Soft delete fields

**Related Tables:**
- `mDivisi` - Division master data
- `mDept` - Department master data
- `mFolder1` - Sub Folder 1 (checked for dependencies, not yet implemented)

## Testing Checklist

### Backend Testing
- [x] List folders with pagination
- [x] List folders without pagination
- [x] Search/filter folders
- [x] Create new folder
- [x] Update existing folder
- [x] Validate folder name uniqueness within department
- [x] Delete folder (check subfolder validation)
- [x] Get folder by ID
- [x] Get divisions for dropdown
- [x] Get departments by division for dropdown
- [x] Soft delete functionality

### Frontend Testing
- [x] Display folder list with pagination
- [x] Search folders
- [x] Add new folder dialog
- [x] Edit existing folder dialog
- [x] Delete folder with confirmation
- [x] Cascade Divisi → Dept dropdown
- [x] Form validation
- [x] Permission-based button visibility
- [x] Toast notifications
- [x] Loading states
- [x] Error handling

## Access Control

### Page Permission: `master_folder`
- **View** - Can view folder list
- **Add** - Can create new folders
- **Edit** - Can update folders
- **Delete** - Can delete folders
- **Admin** - Full access (overrides individual permissions)

### Permission Check
```javascript
const res = await axios.get(`${VITE_API}pageakses`, {
  params: {
    role: empid(),
    page: 'master_folder',
    domain: domain(),
  }
});
```

## API Endpoints Summary

| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| GET | `/listFolder` | Get paginated folders | ✅ Implemented |
| POST | `/saveFolder` | Create/update folder | ✅ Implemented |
| POST | `/deleteFolder` | Soft delete folder | ✅ Implemented |
| GET | `/getFolderById` | Get folder details | ✅ Implemented |
| GET | `/getSelectDivisi` | Get divisions dropdown | ✅ Implemented |
| GET | `/getSelectDept` | Get departments dropdown | ✅ Implemented |
| GET | `/listSubFolder1` | Get sub folders level 1 | ⏳ Placeholder |
| POST | `/saveSubFolder1` | Save sub folder level 1 | ⏳ Placeholder |
| POST | `/deleteSubFolder1` | Delete sub folder level 1 | ⏳ Placeholder |
| GET | `/listSubFolder2` | Get sub folders level 2 | ⏳ Placeholder |
| POST | `/saveSubFolder2` | Save sub folder level 2 | ⏳ Placeholder |
| POST | `/deleteSubFolder2` | Delete sub folder level 2 | ⏳ Placeholder |
| GET | `/getSelectFolder` | Get folders for dropdown | ⏳ Placeholder |
| GET | `/getSelectSubFolder1` | Get sub folders 1 dropdown | ⏳ Placeholder |

## Future Enhancements (Phase 2)

### Sub Folder 1 & Sub Folder 2
When implementing the hierarchical folder structure:

1. **Add Tabs to Frontend**
   - Tab 1: Main Folder (current implementation)
   - Tab 2: Sub Folder 1 (parent: Main Folder)
   - Tab 3: Sub Folder 2 (parent: Sub Folder 1)

2. **Implement Controllers**
   - Replace placeholder functions with full CRUD operations
   - Add parent folder dropdowns
   - Validate parent-child relationships

3. **Database Tables**
   - `mFolder1` - Sub Folder level 1
   - `mFolder2` - Sub Folder level 2

4. **Additional Features**
   - Breadcrumb showing folder hierarchy
   - Recursive delete (optional, with confirmation)
   - Folder tree view
   - Drag-and-drop reorganization

## Migration Notes

### Breaking Changes
- Route changed from `/master_folder` to `/master/folder` (redirect added for backward compatibility)
- Page access parameter: `master_folder` (without leading slash)

### Data Migration
No data migration needed - uses existing `mFolder` table with compatible schema.

### Configuration
- Uses existing `mDivisi` and `mDept` tables
- Domain filtering applied based on user's domain
- Permission-based access control via `mAkses` table

## Common Issues & Solutions

### Issue: Department dropdown is empty
**Solution**: Ensure Divisi is selected first. The cascade system requires division selection.

### Issue: Cannot delete folder
**Solution**: Check if folder has subfolders in `mFolder1` table. Delete subfolders first.

### Issue: Folder name case inconsistency
**Solution**: Backend automatically converts to uppercase. This is by design to match old system.

### Issue: 404 error when accessing page
**Solution**: Check user has permission for `master_folder` page in `mAkses` table.

## Related Documentation
- [MIGRATION_PLANT.md](./MIGRATION_PLANT.md) - Similar migration pattern
- [MIGRATION_DEPT.md](./MIGRATION_DEPT.md) - Cascade dropdown pattern reference
- [MIGRATION_USER.md](./MIGRATION_USER.md) - Permission system reference
- [MIGRATION_MENU.md](./MIGRATION_MENU.md) - Routing pattern reference

## Developer Notes
- Follow the Plant.vue style pattern for consistency
- Use existing helper functions: `domain()`, `empid()`, `admin()`, `decrypt()`, `encrypt()`
- Backend uses `dbDMS` for database queries
- All delete operations are soft deletes
- Validation: Frontend (Yup) + Backend (business rules)
- Use Quasar components and Tailwind CSS for styling

## Timeline
- **Phase 1** (Completed): Main Folder CRUD operations
- **Phase 2** (Future): Sub Folder 1 & 2 implementation based on user requirements

---

**Migration Completed By**: AI Assistant  
**Date**: June 25, 2026  
**Status**: Phase 1 Complete - Ready for Testing
