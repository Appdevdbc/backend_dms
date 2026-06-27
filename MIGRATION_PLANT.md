# Plant Management Migration

## Overview
Migration of Plant (Division) Management functionality from old PHP/AngularJS to new Node.js/Vue.js stack.

## Migration Date
June 25, 2026

## Database Structure

### Tables Used
- `mDivisi` - Plant/Division master table
  - `divisi_iddiv` (INT) - Primary key
  - `divisi_name` (VARCHAR) - Plant name
  - `divisi_note` (TEXT) - Plant description/note
  - `divisi_path` (VARCHAR) - Path for file storage
  - `divisi_path1` (VARCHAR) - Alternative path
  - `divisi_domain` (VARCHAR) - Domain/BU identifier
  - `created_by` (VARCHAR) - Creator empid
  - `created_at` (DATETIME) - Creation timestamp
  - `updated_by` (VARCHAR) - Last updater empid
  - `updated_at` (DATETIME) - Last update timestamp
  - `deleted_by` (VARCHAR) - Deleter empid (soft delete)
  - `deleted_at` (DATETIME) - Deletion timestamp (soft delete)

## Old Implementation (PHP/AngularJS)

### Backend Files
- **Controller**: `application/controllers/User_Action.php`
  - Methods: `get_data_divisi()`, `save_divisi()`, `delete_divisi()`
- **Model**: `application/models/Model_User.php`
  - Methods: `get_data_divisi()`
- **View**: `application/views/master-divisi.php`
- **JavaScript**: `assets/master_divisi.js` (AngularJS + DataTables)

### Route
- `/master_plant` (calls `User.php::master_plant()` method)

### Old Functionality
1. **List Plants**: Display all plants with DataTables
2. **Add Plant**: Form with fields:
   - Name Plant (required)
   - Note (optional)
   - Path (hidden, default: "D:\")
3. **Edit Plant**: Pre-fill form with existing data
4. **Delete Plant**: Hard delete from database

## New Implementation (Node.js/Vue.js)

### Backend Files
- **Controller**: `dms-be/controllers/master/plantController.js`
- **Router**: `dms-be/router/master.js`

### Backend Endpoints

#### 1. GET `/listPlant`
Get paginated or non-paginated list of plants
- **Query Parameters**:
  - `rowsPerPage`: Number of rows per page (optional, if null returns all)
  - `page`: Current page number
  - `filter`: Search filter (searches in name and note)
  - `sortBy`: Column to sort by (default: divisi_iddiv)
  - `descending`: Sort direction (true/false)
- **Response**: Array of plants or paginated response with data and pagination info
- **Features**: 
  - Soft delete filter (whereNull('deleted_at'))
  - Search in plant name and note
  - Pagination support

#### 2. POST `/savePlant`
Create new plant or update existing plant
- **Body Parameters**:
  - `id`: Plant ID (for update, 0 or null for create)
  - `divisi_name`: Plant name (required)
  - `divisi_note`: Plant description (optional)
  - `creator`: Encrypted empid
  - `domain`: Domain/BU identifier
- **Validation**:
  - Check if plant name already exists in same domain
  - Decrypt creator empid
- **Response**: "sukses" or error message

#### 3. POST `/deletePlant`
Soft delete plant by ID
- **Body Parameters**:
  - `id`: Plant ID to delete
  - `creator`: Encrypted empid
- **Validation**:
  - Check if plant has departments (mDept.dept_divisi)
  - Prevent deletion if departments exist
- **Response**: "success" or error message

#### 4. GET `/getPlantById`
Get single plant data by ID
- **Query Parameters**:
  - `id`: Plant ID
- **Response**: Plant object or 404 error

### Frontend Files
- **Component**: `dms-fe/src/pages/Master/Plant.vue`
- **Route**: `/master/plant` (within MainLayout)

### Frontend Features

#### 1. Plant List Table
- Displays all plants with pagination
- Columns: Aksi, Plant, Keterangan
- Search functionality (searches in plant name and note)
- Configurable rows per page (5, 10, 25, 50, 100, 200)
- Access control based on user permissions
- Modern Quasar table with Tailwind CSS styling

#### 2. Add Plant Form
- Nama Plant (required, max 100 chars)
- Keterangan (optional, textarea, max 200 chars)
- Domain automatically set from user context

#### 3. Edit Plant
- Pre-fills form with existing plant data
- Same validation as add form
- Updates existing record

#### 4. Delete Plant
- Confirmation dialog before deletion
- Soft delete (sets deleted_at and deleted_by)
- Validation: Cannot delete plant with departments

#### 5. Permissions
- View: Can view plant list
- Add: Can add new plant
- Edit: Can edit existing plant
- Delete: Can delete plant
- Admin: Has all permissions

## Route Configuration

### Backend Route
Added to `dms-be/router/master.js`:
```javascript
import { listPlant, savePlant, deletePlant, getPlantById } from "../controllers/master/plantController.js";

//PlantController
router.get('/listPlant', listPlant);
router.post('/savePlant', savePlant);
router.post('/deletePlant', deletePlant);
router.get('/getPlantById', getPlantById);
```

### Frontend Route
Added to `dms-fe/src/routes/master.js`:
```javascript
{
  path: "plant",
  component: () => import("./../pages/Master/Plant.vue"),
}
```

### Backward Compatibility
Updated redirect in `dms-fe/src/routes/router.js`:
```javascript
{
  path: "/master_plant",
  redirect: "/master/plant"
}
```

## Key Differences from Old System

1. **Layout**:
   - Old: Standalone page without consistent layout
   - New: Uses MainLayout with sidebar navigation

2. **Data Loading**:
   - Old: Server-side DataTables with AJAX
   - New: Vue reactive data with Quasar table and pagination

3. **Delete Operation**:
   - Old: Hard delete (permanent removal)
   - New: Soft delete (sets deleted_at and deleted_by fields)

4. **Validation**:
   - Old: Basic client-side validation
   - New: 
     - Yup schema validation on client
     - Server-side duplicate check
     - Department dependency check before deletion

5. **UI/UX**:
   - Old: Bootstrap + AngularJS with basic styling
   - New: Quasar + Vue 3 with modern Tailwind CSS styling
     - Rounded cards with shadows
     - Gradient headers
     - Icon integration
     - Hover effects and transitions
     - Toast notifications

6. **Path Management**:
   - Old: Fixed path "D:\" stored in database
   - New: Path fields preserved but empty (for future use if needed)

7. **Domain Filtering**:
   - Old: Filtered by session domain
   - New: Filtered by domain from user context

## Code Examples

### Backend Controller Function (savePlant)
```javascript
export const savePlant = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { id, divisi_name, divisi_note, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    const domain = req.body.domain || process.env.DEFAULT_DOMAIN || 'DMS';
    
    const plantData = {
      divisi_name,
      divisi_note: divisi_note || '',
      divisi_path: '',
      divisi_path1: '',
      divisi_domain: domain,
      updated_by: creator_decrypt,
      updated_at: now,
    };
    
    if (id && id > 0) {
      await trx('mDivisi').where('divisi_iddiv', id).update(plantData);
    } else {
      const existing = await trx('mDivisi')
        .where('divisi_name', divisi_name)
        .where('divisi_domain', domain)
        .whereNull('deleted_at')
        .first();
      
      if (existing) {
        await trx.rollback();
        return res.status(406).json({
          type: 'error',
          message: 'Plant with this name already exists',
        });
      }
      
      await trx('mDivisi').insert({
        ...plantData,
        created_by: creator_decrypt,
        created_at: now,
      });
    }
    
    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /savePlant', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
```

### Frontend Component (Key Parts)
```vue
<template>
  <div class="q-pa-md">
    <q-card class="tw-shadow-2xl tw-rounded-2xl tw-overflow-hidden">
      <!-- Header with gradient background -->
      <q-card-section :class="`side-${domain()}-1 tw-py-6`">
        <div class="tw-flex tw-items-center tw-gap-3">
          <q-icon name="factory" size="28px" class="tw-text-white" />
          <div>
            <div class="text-h6 tw-text-white tw-font-bold">Master Plant</div>
            <!-- Breadcrumb -->
          </div>
        </div>
      </q-card-section>
      
      <!-- Data Table -->
      <q-card-section class="tw-bg-white">
        <q-table
          :rows="listPlant"
          :columns="columns"
          v-model:pagination="pagination"
          @request="onRequest"
        >
          <!-- Table slots -->
        </q-table>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from "vue";
import axios from "axios";
import * as yup from "yup";

// Validation schema
const schema = yup.object({
  divisi_name: yup.string().required("Nama plant wajib diisi").nullable(),
});

// API calls
const getPlant = async () => {
  const res = await axios.get(`${import.meta.env.VITE_API}listPlant`, {
    params: pagination.value
  });
  // Handle response
};

const savePlant = async () => {
  await axios.post(`${import.meta.env.VITE_API}savePlant`, tmpForm);
  // Show success message
};
</script>
```

## Testing Checklist

- [x] List all plants (with pagination)
- [x] Search plants by name and note
- [x] Add new plant
  - [x] Name validation (required)
  - [x] Check duplicate plant name
  - [x] Domain automatically set
- [x] Edit existing plant
  - [x] Load plant data
  - [x] Update plant data
- [x] Delete plant
  - [x] Confirmation dialog
  - [x] Soft delete
  - [x] Prevent deletion if plant has departments
- [x] Test access permissions (view, add, edit, delete)
- [x] Test form validations
- [x] Test with different user roles
- [x] Backward compatibility (`/master_plant` redirects correctly)
- [ ] Test integration with Department module

## Migration Notes

1. **Database**: Uses existing `mDivisi` table
   - Added soft delete columns if not exist: `deleted_by`, `deleted_at`
   - Path columns preserved but not actively used

2. **Data Migration**: Not required - existing data is compatible

3. **API Endpoints**: All endpoints created and tested

4. **Domain Context**: Uses domain from user context (not session)

5. **Path Management**: Path fields (divisi_path, divisi_path1) are set to empty strings for now. If file storage management is needed later, path creation logic can be added.

## Related Functionality

Plant management is used by:
- Department management (mDept.dept_divisi references mDivisi.divisi_iddiv)
- User organizational structure
- File/folder organization (if path management is implemented)

## Future Enhancements

1. **Path Management**: Implement automatic folder creation if needed
2. **Department Count**: Show number of departments per plant in list
3. **Bulk Operations**: Add bulk delete/edit capabilities
4. **Import/Export**: Add CSV import/export functionality
5. **Audit Trail**: Show creation and modification history

## Author
AI Assistant (Kiro)

## References
- Old PHP Controller: `User_Action.php` (lines 424-480)
- Old View: `master-divisi.php`
- Old JavaScript: `master_divisi.js`
- New Controller: `plantController.js`
- New Component: `Plant.vue`
- Similar Migration: `MIGRATION_MENU.md`
