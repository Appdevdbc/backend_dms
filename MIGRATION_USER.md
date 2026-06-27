# User Management Migration

## Overview
Migration of User Management functionality from old PHP/AngularJS to new Node.js/Vue.js stack.

## Migration Date
June 25, 2026

## Database Structure

### Tables Used
- `master_user` / `mUser` - Main user table
- `portal.dbo.ptl_hris` - Portal HRIS data for user information
- `master_div` / `master_div_new` - Division master
- `master_dept` - Department master
- `master_role` / `mRole` - Role master

## Old Implementation (PHP/AngularJS)

### Backend Files
- **Controller**: `application/controllers/User_Action.php`
  - Methods: `get_data_user()`, `save_user()`, `delete_user()`, `get_data_user_byid()`
  - Methods: `get_select_divisi()`, `get_select_dept()`, `get_select_role()`
- **View**: `application/views/master-user.php`
- **JavaScript**: `assets/master_user.js` (AngularJS + DataTables)

### Route
- `/master_user`

## New Implementation (Node.js/Vue.js)

### Backend Files
- **Controller**: `dms-be/controllers/master/userController.js`
- **Router**: `dms-be/router/master.js`

### Backend Endpoints

#### 1. GET `/users` (Already exists - used for listing)
Get paginated or non-paginated list of users with HRIS data
- **Query Parameters**:
  - `rowsPerPage`: Number of rows per page (optional)
  - `page`: Current page number
  - `filter`: Search filter
  - `sortBy`: Column to sort by
  - `descending`: Sort direction (true/false)

#### 2. GET `/getHrisByNIK` (Already exists)
Get user data from HRIS by NIK
- **Query Parameters**:
  - `nik`: User NIK
  - `empid`: Encrypted employee ID (optional)

#### 3. Additional Endpoints Needed (from old PHP)
These need to be created or mapped to existing endpoints:
- `User_Action/save_user` → Map to existing save endpoint
- `User_Action/delete_user/:id` → Map to existing delete endpoint
- `User_Action/get_data_user_byid/:id` → Create new endpoint
- `User_Action/get_select_divisi` → Create new endpoint
- `User_Action/get_select_dept` → Create new endpoint
- `User_Action/get_select_role` → Use existing `/getRoles`

### Frontend Files
- **Component**: `dms-fe/src/pages/Master/User.vue`
- **Route**: `/master/users` (within MainLayout)

### Frontend Features

#### 1. User List Table
- Displays all users with pagination
- Columns: Aksi, NIK, Nama, Email, Jabatan, Status
- Search functionality
- Configurable rows per page (5, 10, 25, 50, 100, 200)
- Access control based on user permissions

#### 2. Add User Form
- NIK (required) - triggers HRIS lookup on blur
- Nama (readonly, from HRIS)
- Email (readonly, from HRIS)
- Password (required for new users)
- Divisi (dropdown, required)
- Departemen (dropdown, required, filtered by divisi)
- Role (dropdown, required)

#### 3. Edit User
- Pre-fills form with existing user data
- Password field not shown (can't change password in edit mode)
- Same validation as add form

#### 4. Delete User
- Confirmation dialog before deletion
- Soft delete (sets deleted_at and deleted_by)

#### 5. HRIS Integration
- Auto-fills user data from portal when NIK is entered
- Validates NIK exists and user is active
- Checks if user already registered in application

#### 6. Permissions
- View: Can view user list
- Add: Can add new user
- Edit: Can edit existing user
- Delete: Can delete user
- Admin: Has all permissions

## Route Configuration

### Backend Route
Already exists in `dms-be/router/master.js`:
```javascript
router.get('/users', listUser);
router.post('/users', saveUser);
router.post('/deleteusers', deleteUser);
router.get('/getHrisByNIK', getHrisByNIK);
router.get('/getRoles', getRoles);
```

### Frontend Route
Route in `dms-fe/src/routes/master.js`:
```javascript
{
  path: "users",
  component: () => import("./../pages/Master/UserManagement.vue"),
}
```

### Backward Compatibility
Added redirect in `dms-fe/src/routes/router.js`:
```javascript
{
  path: "/master_user",
  redirect: "/master/users"
}
```

## Key Differences from Old System

1. **Layout**:
   - Old: Standalone page without consistent layout
   - New: Uses MainLayout with sidebar navigation

2. **Data Loading**:
   - Old: Server-side DataTables with AJAX
   - New: Vue reactive data with Quasar table and pagination

3. **HRIS Integration**:
   - Old: Direct database queries in PHP
   - New: API endpoint that queries HRIS database

4. **Password Management**:
   - Old: Password required and editable
   - New: Password only required for new users, not editable in edit mode

5. **Validation**:
   - Old: Basic client-side validation
   - New: Yup schema validation on client + server validation

6. **UI/UX**:
   - Old: Bootstrap + AngularJS with basic styling
   - New: Quasar + Vue 3 with modern Tailwind CSS styling

7. **Divisi/Dept Cascade**:
   - Old: jQuery change event on divisi dropdown
   - New: Vue reactive watch on divisi selection

## Missing Endpoints to Create

The following endpoints from the old PHP need to be created in Node.js:

### 1. GET `/User_Action/get_data_user_byid/:id`
Get single user data by ID for editing
```javascript
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await dbDMS('master_user as u')
      .select('u.*', 'v.user_name', 'v.user_email')
      .leftJoin('portal.dbo.ptl_hris as v', 'v.Emp_Id', 'u.emp_id')
      .where('u.user_id', id)
      .first();
    res.status(200).json(user);
  } catch (error) {
    return res.status(406).json(getErrorResponse(error));
  }
};
```

### 2. GET `/User_Action/get_select_divisi`
Get list of divisions for dropdown
```javascript
export const getSelectDivisi = async (req, res) => {
  try {
    const { id } = req.query;
    const divisi = await dbHris('master_div')
      .select('id_div as value', 
        db.raw("CONCAT(kode_div, ' - ', nama_div) as description"))
      .where('status', 'Active')
      .orderBy('nama_div');
    
    res.status(200).json(divisi);
  } catch (error) {
    return res.status(406).json(getErrorResponse(error));
  }
};
```

### 3. GET `/User_Action/get_select_dept`
Get list of departments filtered by division
```javascript
export const getSelectDept = async (req, res) => {
  try {
    const { iddiv, iddept } = req.query;
    let query = dbHris('master_dept')
      .select('id_dept as value',
        db.raw("CONCAT(kode_dept, ' - ', nama_dept) as description"))
      .where('status', 'Active')
      .orderBy('nama_dept');
    
    if (iddiv && iddiv !== '0') {
      query = query.where('id_div', iddiv);
    }
    
    const dept = await query;
    res.status(200).json(dept);
  } catch (error) {
    return res.status(406).json(getErrorResponse(error));
  }
};
```

### 4. GET `/User_Action/get_select_role`
Already exists as `/getRoles` - just need to format for dropdown

## Testing Checklist

- [ ] List all users (with pagination)
- [ ] Search users by NIK, name, email
- [ ] Add new user
  - [ ] NIK validation
  - [ ] HRIS data auto-fill
  - [ ] Check duplicate user
  - [ ] Password validation
- [ ] Edit existing user
  - [ ] Load user data
  - [ ] Update user data
  - [ ] No password change
- [ ] Delete user
  - [ ] Confirmation dialog
  - [ ] Soft delete
- [ ] Divisi/Dept cascade
  - [ ] Dept filtered by divisi
  - [ ] Dept cleared when divisi changes
- [ ] Test access permissions (view, add, edit, delete)
- [ ] Test form validations
- [ ] Test with different user roles
- [ ] Backward compatibility (`/master_user` redirects correctly)

## Migration Notes

1. **Database**: Uses existing tables, no schema changes required
2. **Data Migration**: Not required - existing data is compatible
3. **API Endpoints**: Some endpoints need to be created (see above)
4. **HRIS Integration**: Uses same HRIS database as old system
5. **Password**: Stored in HRIS, application just creates user record

## Related Functionality

This user management is used by:
- Authentication/Login system
- Role-based access control
- User group assignments
- Menu access management

## Author
AI Assistant (Kiro)

## References
- Old PHP Controller: `User_Action.php`
- Old View: `master-user.php`
- Old JavaScript: `master_user.js`
- New Controller: `userController.js`
- New Component: `User.vue`
