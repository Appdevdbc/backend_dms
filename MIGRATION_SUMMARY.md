# DMS Migration Summary

## Project Overview
Migration of Document Management System (DMS) from PHP/AngularJS to Node.js/Vue.js

**Workspace**: `d:\Projects\DMS\Migrasi 2026\app\`
- Backend: `dms-be/` (Node.js + Express + Knex)
- Frontend: `dms-fe/` (Vue.js 3 + Quasar + Tailwind CSS)

## Completed Migrations

### 1. Master Menu ✅
**Old Route**: `/master_menu`  
**New Route**: `/master/menu`

**Files Created/Modified:**
- Frontend: `dms-fe/src/pages/Master/Menu.vue`
- Backend: `dms-be/controllers/master/menuController.js`
- Routes: Added to MainLayout with sidebar
- Documentation: `dms-be/MIGRATION_MENU.md`

**Key Features:**
- Menu management with parent/sub menu hierarchy
- Icon picker integration
- Order management
- Permission-based access control

---

### 2. Master User ✅
**Old Route**: `/master_user`  
**New Route**: `/master/users`

**Files Created/Modified:**
- Frontend: `dms-fe/src/pages/Master/UserManagement.vue`
- Backend: `dms-be/controllers/master/userController.js`
- Documentation: `dms-be/MIGRATION_USER.md`

**Key Features:**
- User CRUD operations
- Role assignment
- Division and Department assignment
- Password encryption
- NIK-based user lookup

**Fixes Applied:**
- Fixed role table join from `role_idrole` to `role_id`
- Added null check for encrypt operation
- Added joins to get related entity names

---

### 3. Master Plant (Divisi) ✅
**Old Route**: `/master_plant`  
**New Route**: `/master/plant`

**Files Created/Modified:**
- Frontend: `dms-fe/src/pages/Master/Plant.vue`
- Backend: `dms-be/controllers/master/plantController.js`
- Documentation: `dms-be/MIGRATION_PLANT.md`

**Key Features:**
- Plant/Division CRUD operations
- Search and pagination
- Validation to prevent deleting plants with departments
- Modern gradient UI with shadow effects

---

### 4. Master Department ✅
**Old Route**: `/master_dept`  
**New Route**: `/master/dept`

**Files Created/Modified:**
- Frontend: `dms-fe/src/pages/Master/Dept.vue`
- Backend: `dms-be/controllers/master/deptController.js`
- Documentation: `dms-be/MIGRATION_DEPT.md`

**Key Features:**
- Department CRUD operations
- Cascade dropdown (Division → Department)
- Validation to prevent deleting departments with users
- Search and pagination

---

### 5. Master Folder ✅
**Old Route**: `/master_folder`  
**New Route**: `/master/folder`

**Files Created/Modified:**
- Frontend: `dms-fe/src/pages/Master/Folder.vue`
- Backend: `dms-be/controllers/master/folderController.js`
- Documentation: `dms-be/MIGRATION_FOLDER.md`

**Key Features:**
- Main Folder CRUD operations (Phase 1)
- Cascade dropdown (Division → Department)
- Folder name auto-uppercase
- Validation for uniqueness and subfolder dependencies
- Sub Folder 1 & 2 placeholders for future enhancement

---

## Common Patterns Established

### Backend Structure
```
dms-be/
├── controllers/master/
│   ├── [feature]Controller.js
├── router/
│   └── master.js (route definitions)
├── config/
│   └── db.js (database connection)
└── helpers/
    └── utils.js (helper functions)
```

**Controller Pattern:**
- `list[Entity]` - GET with pagination support
- `save[Entity]` - POST for create/update
- `delete[Entity]` - POST for soft delete
- `get[Entity]ById` - GET single record
- `getSelect[Entity]` - GET for dropdown options

**Standard Features:**
- Soft delete with `deleted_at` and `deleted_by`
- Server-side pagination
- Search/filter functionality
- Domain-aware queries
- Audit fields (created_by, updated_by, etc.)

### Frontend Structure
```
dms-fe/
├── src/
│   ├── pages/Master/
│   │   └── [Feature].vue
│   ├── routes/
│   │   ├── router.js (main router)
│   │   └── master.js (master routes)
│   ├── layouts/
│   │   └── MainLayout.vue (with sidebar)
│   └── utils/
│       └── index.js (helper functions)
```

**Component Pattern:**
- Table with server-side pagination
- Search/filter input
- Add/Edit dialog forms
- Delete confirmation dialogs
- Permission-based button visibility
- Modern UI with Quasar + Tailwind

**Standard Columns:**
1. Aksi (Actions) - sticky left column
2. Main entity fields
3. Related entity names (via joins)

**Standard Form Elements:**
- Required field indicator (red asterisk)
- Icon prepends for visual clarity
- Character counter for limited fields
- Validation using Yup schema
- Cascade dropdowns where applicable

### UI/UX Styling Standards

**Header:**
```vue
<q-card-section :class="`side-${domain()}-1 tw-py-6`">
  <div class="tw-flex tw-items-center tw-gap-3">
    <q-icon name="[icon]" size="28px" class="tw-text-white" />
    <div>
      <div class="text-h6 tw-text-white tw-font-bold">[Title]</div>
      <div class="tw-flex tw-items-center tw-gap-2 tw-text-blue-100 tw-text-xs">
        <!-- Breadcrumb -->
      </div>
    </div>
  </div>
</q-card-section>
```

**Action Buttons:**
- Edit: `color="orange-7"` with round shape
- Delete: `color="red-7"` with round shape
- Save: Primary domain color
- Add: Primary domain color

**Dialog:**
- Rounded corners: `tw-rounded-2xl`
- Shadow: `tw-shadow-2xl`
- Max width: `tw-max-w-2xl`
- Info banner for required fields

### Routing Pattern

**Old Routes → New Routes:**
- `/master_[feature]` → `/master/[feature]`
- All old routes have redirects in `router.js`
- All new routes use MainLayout with sidebar

**Example:**
```javascript
// Redirect (in router.js)
{
  path: "/master_folder",
  redirect: "/master/folder"
}

// Actual route (in master.js)
{
  path: "folder",
  component: () => import("./../pages/Master/Folder.vue"),
}
```

### Permission System

**Page Access Check:**
```javascript
const res = await axios.get(`${VITE_API}pageakses`, {
  params: {
    role: empid(),
    page: 'master_folder', // without leading slash
    domain: domain(),
  }
});
```

**Permission Fields:**
- `add` - Can create new records
- `edit` - Can update records
- `delete` - Can delete records
- `view` - Can view list
- `admin` - Full access (overrides others)

### Helper Functions Used

**Frontend:**
- `domain()` - Get current domain
- `empid()` - Get encrypted employee ID
- `admin()` - Check if user is admin
- `decrypt(value)` - Decrypt value
- `encrypt(value)` - Encrypt value
- `decryptMessage(value)` - Decrypt message
- `spinnerBall()` - Show loading spinner
- `ParseError(error)` - Parse error for display

**Backend:**
- `decrypt(value)` - Decrypt value
- `encrypt(value)` - Encrypt value
- `getErrorResponse(error)` - Format error response
- `logger(error, location, data)` - Log errors

## Database Schema Pattern

**Standard Fields:**
```sql
[entity]_id INT PRIMARY KEY AUTO_INCREMENT
[entity]_name VARCHAR(100)
[entity]_note/desc VARCHAR(200)
[entity]_domain VARCHAR(50)
created_by VARCHAR(50)
created_at DATETIME
updated_by VARCHAR(50)
updated_at DATETIME
deleted_by VARCHAR(50)
deleted_at DATETIME
```

## Testing Approach

### Backend Testing Checklist:
- [ ] List with pagination
- [ ] List without pagination
- [ ] Search/filter
- [ ] Create new record
- [ ] Update existing record
- [ ] Delete record (with dependency validation)
- [ ] Get by ID
- [ ] Dropdown endpoints
- [ ] Soft delete verification
- [ ] Permission checks

### Frontend Testing Checklist:
- [ ] Display list with pagination
- [ ] Search functionality
- [ ] Add dialog
- [ ] Edit dialog
- [ ] Delete with confirmation
- [ ] Form validation
- [ ] Permission-based visibility
- [ ] Toast notifications
- [ ] Loading states
- [ ] Error handling
- [ ] Cascade dropdowns (if applicable)

## Key Corrections & Learnings

### 1. Route Structure
- ✅ Use MainLayout for all master pages (shows sidebar)
- ✅ Page access parameter should not have leading slash
- ✅ Add redirects for old routes for backward compatibility

### 2. Join Fixes
- ✅ User role join: Use `role_id` not `role_idrole`
- ✅ Always include related table names in SELECT when displaying lists

### 3. Validation
- ✅ Frontend: Yup schema validation
- ✅ Backend: Business rule validation (uniqueness, dependencies)
- ✅ Null checks before encrypt/decrypt operations

### 4. UI Consistency
- ✅ Follow Plant.vue styling pattern
- ✅ Uppercase column headers
- ✅ Round action buttons with shadow effects
- ✅ Gradient headers with domain color
- ✅ Orange for edit, Red for delete

### 5. Database Best Practices
- ✅ Soft delete for all records
- ✅ Audit trail (created_by, updated_by, deleted_by)
- ✅ Domain filtering
- ✅ Foreign key relationships via joins

## Migration Workflow

1. **Research Phase**
   - Find old PHP controller and view files
   - Identify database tables and relationships
   - Document old functionality and business rules

2. **Backend Phase**
   - Create controller with CRUD endpoints
   - Implement validation and business rules
   - Add routes to master.js
   - Test endpoints with Postman/similar

3. **Frontend Phase**
   - Create Vue component following established pattern
   - Implement table, forms, and dialogs
   - Add route to master.js
   - Add redirect in router.js
   - Test UI interactions

4. **Documentation Phase**
   - Create MIGRATION_[FEATURE].md
   - Document endpoints, fields, business rules
   - Add testing checklist
   - Document known issues and solutions

5. **Verification Phase**
   - Run getDiagnostics
   - Test all CRUD operations
   - Verify permissions
   - Check cascade dropdowns
   - Validate error handling

## Next Features to Migrate

Potential candidates based on typical DMS systems:
- Master Role Access Management
- Master Domain Management
- Master Site Management
- Master Collection Management
- Document Upload/Management
- Approval Workflows
- Reporting Features

## Development Environment

**Backend:**
- Node.js + Express.js
- Knex.js (Query Builder)
- dotenv (Environment variables)
- dayjs (Date handling)
- multer (File uploads)

**Frontend:**
- Vue.js 3 (Composition API)
- Quasar Framework
- Tailwind CSS
- Axios (HTTP client)
- Yup (Validation)
- Vue Router

**Database:**
- MySQL/MariaDB
- Tables prefixed with 'm' for master data

## File Naming Conventions

**Backend:**
- Controllers: `[feature]Controller.js` (PascalCase)
- Routes: `master.js`, `wjs.js`, etc. (lowercase)
- Helpers: `[feature].helper.js` (lowercase)

**Frontend:**
- Components: `[Feature].vue` (PascalCase)
- Routes: `master.js`, `router.js` (lowercase)
- Utils: `index.js`, `utils.js` (lowercase)

**Documentation:**
- `MIGRATION_[FEATURE].md` (UPPERCASE)

## Important Notes

1. **Never modify router.js for layout changes** - Use MainLayout structure in master.js instead
2. **Permission page names** - Use format without leading slash (e.g., `master_folder` not `/master_folder`)
3. **Auto-uppercase fields** - Some fields like folder names are auto-converted to uppercase for consistency
4. **Cascade dropdowns** - Always reset child dropdown when parent changes
5. **Soft deletes** - Never hard delete, always set deleted_at timestamp
6. **Domain filtering** - All queries should be domain-aware
7. **v-model:pagination linting** - Known Quasar pattern, can be ignored

## Contact & Support

For questions or issues with migrations, refer to:
- Individual MIGRATION_*.md files for specific features
- This summary for overall patterns and standards
- Existing migrated components (Plant, Dept, User, Menu) as references

---

**Last Updated**: June 25, 2026  
**Migration Count**: 5 features completed  
**Status**: Active Development
