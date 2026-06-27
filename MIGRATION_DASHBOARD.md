# Dashboard Migration Documentation

## Overview
Migration of the Dashboard report module from PHP (CodeIgniter) to Node.js + Vue 3.

## Migration Date
June 27, 2026

## Old Routes (PHP)
- **Controller**: `User.php` → `public function dashboard()`
- **View**: `application/views/dashboard.php`
- **Chart Controller**: `User_Chart.php` → `get_content_json()`, `get_dept_json()`
- **Model**: `Model_User.php` → `getDataForm()`, `getDataProsedur()`, `getDataIk()`, `get_dept_json()`, `get_content_json()`

## New Routes (Node.js + Vue 3)

### Backend Routes
Base URL: `/api/report`

| Method | Endpoint | Description | Controller |
|--------|----------|-------------|------------|
| GET | `/getDashboardStats` | Get statistics cards data (Prosedur, IK, Form totals) | `dashboardController.getDashboardStats` |
| GET | `/getChartData` | Get column chart data (documents per department grouped by folder type) | `dashboardController.getChartData` |

### Frontend Routes
| Path | Component | Description |
|------|-----------|-------------|
| `/report/dashboard` | `Dashboard.vue` | Main dashboard with stats and chart |

## Database Tables Used

### mContent
- Primary table for documents
- Columns: `content_id`, `content_iddept`, `content_idfolder`, `content_active`, `content_domain`

### mFolder
- Folder/document type information
- Columns: `folder_id`, `folder_name`, `folder_iddept`, `folder_domain`

### mDept
- Department information
- Columns: `dept_id`, `dept_name`

## Features Implemented

### Statistics Cards
1. **Total PROSEDUR**
   - Red card with icon
   - Counts active documents where folder_name = 'PROSEDUR'
   - Filtered by user domain

2. **Total IK (Instruksi Kerja)**
   - Green card with icon
   - Counts active documents where folder_name = 'INSTRUKSI KERJA'
   - Filtered by user domain

3. **Total FORM (Formulir)**
   - Yellow card with icon
   - Counts active documents where folder_name = 'FORMULIR'
   - Filtered by user domain

### Column Chart
- **Title**: "Total Dokumen Per Departemen"
- **Type**: Highcharts Column Chart
- **X-Axis**: Department names
- **Y-Axis**: Document count
- **Series**: Each folder type (grouped bar chart)
- **Tooltip**: Shows folder name and count on hover
- **Data**: 
  - Groups documents by department and folder type
  - Only counts active documents (`content_active = 1`)
  - Filtered by user domain

## Backend Implementation

### Controller: `dashboardController.js`

#### `getDashboardStats(req, res)`
**Purpose**: Get statistics for the three cards

**Logic**:
1. Extract user domain from request
2. Query mContent joined with mFolder for each document type:
   - PROSEDUR
   - INSTRUKSI KERJA
   - FORMULIR
3. Filter by:
   - `content_active = 1`
   - User domain
4. Return counts for each type

**Response**:
```json
{
  "success": true,
  "data": {
    "prosedur": 25,
    "ik": 18,
    "form": 42
  }
}
```

#### `getChartData(req, res)`
**Purpose**: Get chart data for documents per department by folder type

**Logic**:
1. Get all unique folder names for user's domain
2. Get all departments
3. For each folder:
   - For each department:
     - Check if folder exists for that department
     - If yes, count active documents for that dept + folder
     - If no, count = 0
   - Build series array with folder name and data points
4. Build categories array with department names
5. Return both series and categories

**Response**:
```json
{
  "success": true,
  "data": {
    "categories": ["Dept A", "Dept B", "Dept C"],
    "series": [
      {
        "name": "PROSEDUR",
        "data": [5, 8, 3]
      },
      {
        "name": "INSTRUKSI KERJA",
        "data": [3, 6, 2]
      },
      {
        "name": "FORMULIR",
        "data": [10, 15, 8]
      }
    ]
  }
}
```

## Frontend Implementation

### Component: `Dashboard.vue`

#### Template Structure
1. **Page Header** - Title and breadcrumb
2. **Statistics Cards** - 3 cards in responsive grid (red, green, yellow)
3. **Chart Card** - Highcharts column chart
4. **Loading Overlay** - Spinner during data load

#### Script Setup
**State**:
- `loading`: Boolean for loading state
- `stats`: Object with prosedur, ik, form counts
- `chartContainer`: Ref to chart div element

**Methods**:
- `getDashboardStats()`: Fetch stats from API
- `loadChartData()`: Fetch chart data from API
- `renderChart(data)`: Render Highcharts column chart
- `loadDashboard()`: Load all data on mount (parallel requests)

**Chart Configuration**:
- Type: Column chart
- Categories: Department names
- Series: Folder types with data
- Tooltip: Shared, formatted table
- Plot Options: Column padding and no border

#### Styling
- Tailwind CSS for layout and spacing
- Quasar components for cards and UI
- Highcharts default styling for chart

## Dependencies

### Backend
- `knex`: Database query builder
- Existing database connection

### Frontend
- `highcharts`: ^12.6.0 (already installed)
- `axios`: HTTP client
- `quasar`: UI components
- `vue`: ^3.2.47

## Testing Checklist

- [ ] Statistics cards display correct counts
- [ ] Chart loads with correct data
- [ ] Chart shows correct department names on X-axis
- [ ] Chart shows correct folder types as series
- [ ] Tooltip shows correct information on hover
- [ ] Loading spinner displays during data fetch
- [ ] Error notifications display on API failure
- [ ] Data is filtered by user domain
- [ ] Only active documents are counted
- [ ] Responsive layout works on mobile/tablet

## Differences from Old Implementation

### Similarities
1. Same statistics (Prosedur, IK, Form counts)
2. Same chart type (Column chart)
3. Same data grouping (Department × Folder Type)
4. Same Highcharts library

### Changes
1. **No Morris.js** - Old code referenced morris.js but actually used Highcharts
2. **Parallel loading** - Stats and chart load simultaneously
3. **Responsive design** - Uses Tailwind grid system
4. **Modern UI** - Quasar components instead of Bootstrap
5. **Better error handling** - Toast notifications on errors
6. **Domain filtering** - Consistent domain filtering in queries

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/getDashboardStats` | GET | Get statistics cards data |
| `/getChartData` | GET | Get chart data |

## Notes
- The old PHP code referenced multiple JavaScript libraries (morris.js, chart.js) but only Highcharts was actually used
- Chart data is built efficiently with minimal database queries
- Only active documents (`content_active = 1`) are counted
- Domain filtering ensures users only see their organization's data

## Migration Status
✅ **COMPLETE**
- Backend controller created
- Routes added
- Frontend component created
- Uses existing Highcharts library
- Ready for testing
