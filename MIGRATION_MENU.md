# Menu Management Migration

## Overview
This document describes the migration of the Menu management functionality from the old PHP/AngularJS application to the new Node.js/Vue.js stack.

## Migration Date
June 24, 2026

## Database Structure

### Table: `mst_menu`
The menu data is stored in the `mst_menu` table with the following key fields:
- `menu_id`: Primary key
- `menu_name`: Name of the menu
- `menu_parent`: Parent menu ID (0 for main menu, >0 for sub menu)
- `menu_link`: Link/route for the menu
- `menu_icon`: Icon class for the menu
- `menu_order`: Display order
- `created_by`, `created_at`: Audit fields for creation
- `updated_by`, `updated_at`: Audit fields for updates
- `deleted_by`, `deleted_at`: Soft delete fields

## Old Implementation (PHP/AngularJS)

### Backend Files
- **Controller**: `application/controllers/User_Action.php`
  - Methods: `get_data_menu()`, `save_menu()`, `delete_menu()`, `get_select_mainmenu()`
- **Model**: `application/models/Model_User.php`
  - Methods: `get_data_menu()`, `get_data_mainmenu()`
- **View**: `application/views/master-menu.php`
- **JavaScript**: `assets/master_menu.js` (AngularJS)

### Route
- `/master_menu`

## New Implementation (Node.js/Vue.js)

### Backend Files
- **Controller**: `dms-be/controllers/master/menuController.js`
- **Router**: `dms-be/router/master.js`

### Backend Endpoints

#### 1. GET `/listMenu`
Get paginated or non-paginated list of menus
- **Query Parameters**:
  - `rowsPerPage`: Number of rows per page (optional, if null returns all)
  - `page`: Current page number
  - `filter`: Search filter
  - `sortBy`: Column to sort by
  - `descending`: Sort direction (true/false)

#### 2. GET `/getMainMenus`
Get list of main menus (menu_parent = 0) for dropdown selection
- **Returns**: Array of { value: menu_id, label: menu_name }

#### 3. POST `/saveMenu`
Create new menu or update existing menu
- **Body Parameters**:
  - `id`: Menu ID (null for new, number for update)
  - `menu_name`: Menu name (required)
  - `menu_type`: 'main' or 'sub' (required)
  - `menu_parent`: Parent menu ID (required for sub menu)
  - `menu_link`: Menu link/route
  - `menu_icon`: Icon class
  - `menu_order`: Display order
  - `creator`: Encrypted creator ID (required)

#### 4. POST `/deleteMenu`
Soft delete a menu
- **Body Parameters**:
  - `id`: Menu ID to delete
  - `creator`: Encrypted creator ID
- **Validation**: Cannot delete menu with children (sub menus)

#### 5. GET `/getMenuById`
Get single menu by ID
- **Query Parameters**:
  - `id`: Menu ID

### Frontend Files
- **Component**: `dms-fe/src/pages/Master/Menu.vue`
- **Route**: `/master/menu`

### Frontend Features

#### 1. Menu List Table
- Displays all menus with pagination
- Columns: Aksi, Nama Menu, Tipe, Link, Urutan
- Search functionality
- Configurable rows per page (5, 10, 25, 50, 100, 200)
- Access control based on user permissions

#### 2. Add Menu Form
- Menu Name (required)
- Menu Type (Main Menu / Sub Menu) - required
- Parent Menu (required for sub menu, dropdown of main menus)
- Menu Link (optional)
- Menu Icon (optional, with hint for icon formats)
- Menu Order (optional, numeric)

#### 3. Edit Menu
- Pre-fills form with existing menu data
- Same validation as add form

#### 4. Delete Menu
- Confirmation dialog before deletion
- Prevents deletion of menus with sub menus
- Soft delete (sets deleted_at and deleted_by)

#### 5. Permissions
- View: Can view menu list
- Add: Can add new menu
- Edit: Can edit existing menu
- Delete: Can delete menu
- Admin: Has all permissions

## Key Differences from Old System

1. **Menu Type Handling**:
   - Old: Stored as 'main'/'sub' string in `menu_tipe` field
   - New: Derived from `menu_parent` (0 = main, >0 = sub)

2. **Validation**:
   - Old: Basic client-side validation
   - New: Both client-side (yup schema) and server-side validation

3. **Delete Protection**:
   - Old: No check for sub menus
   - New: Prevents deletion of menus with children

4. **Soft Delete**:
   - Old: Hard delete
   - New: Soft delete with deleted_at and deleted_by fields

5. **UI/UX**:
   - Old: Bootstrap + AngularJS with basic styling
   - New: Quasar + Vue 3 with modern Tailwind CSS styling

6. **Data Encryption**:
   - Old: No encryption
   - New: User IDs are encrypted in transit

## Testing Checklist

- [ ] List all menus (with pagination)
- [ ] Search menus by name or link
- [ ] Add new main menu
- [ ] Add new sub menu
- [ ] Edit existing main menu
- [ ] Edit existing sub menu
- [ ] Change menu from main to sub
- [ ] Change menu from sub to main
- [ ] Delete menu without children
- [ ] Try to delete menu with children (should fail)
- [ ] Verify soft delete (check database)
- [ ] Test access permissions (view, add, edit, delete)
- [ ] Test form validations
- [ ] Test with different user roles

## Migration Notes

1. **Database**: No changes required - uses existing `mst_menu` table
2. **Data Migration**: Not required - existing data is compatible
3. **Menu Type**: Frontend determines type based on `menu_parent` value
4. **Icons**: Old system used Font Awesome, new system supports multiple icon sets
5. **Order**: Menu ordering is preserved via `menu_order` field

## Related Migrations

This menu management is used by:
- User role access management
- Menu collection system
- Navigation menu rendering

## Author
AI Assistant (Kiro)

## References
- Old PHP Controller: `User_Action.php`
- Old Model: `Model_User.php`
- Old View: `master-menu.php`
- New Controller: `menuController.js`
- New Component: `Menu.vue`
