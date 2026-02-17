// ========== SAFE ZONES FOR IET-DAVV INDORE ==========
// Approximate coordinates; refine with on-ground verification.

window.safeZones = [
    {
        id: 'zone1',
        name: 'IET Main Campus',
        latitude: 22.6870,
        longitude: 75.8610,
        radius: 600,
        color: '#28a745',
        activeHours: null,
        enabled: true,
        description: 'Main academic area including lecture halls and labs'
    },
    {
        id: 'zone2',
        name: 'Girls Hostel Area',
        latitude: 22.6885,
        longitude: 75.8625,
        radius: 250,
        color: '#fd7e14',
        activeHours: { start: 18, end: 6 },
        enabled: true,
        description: 'Girls hostel - Night protection'
    },
    {
        id: 'zone3',
        name: 'Boys Hostel Area',
        latitude: 22.6855,
        longitude: 75.8595,
        radius: 250,
        color: '#17a2b8',
        activeHours: { start: 18, end: 6 },
        enabled: true,
        description: 'Boys hostel - Night protection'
    },
    {
        id: 'zone4',
        name: 'Library & Study Area',
        latitude: 22.6875,
        longitude: 75.8615,
        radius: 150,
        color: '#6f42c1',
        activeHours: { start: 8, end: 22 },
        enabled: true,
        description: 'Library zone - Study hours'
    },
    {
        id: 'zone5',
        name: 'Sports Complex',
        latitude: 22.6890,
        longitude: 75.8600,
        radius: 200,
        color: '#ffc107',
        activeHours: { start: 6, end: 20 },
        enabled: true,
        description: 'Sports facilities - Day hours'
    },
    {
        id: 'zone6',
        name: 'Canteen & Food Court',
        latitude: 22.6868,
        longitude: 75.8618,
        radius: 100,
        color: '#e83e8c',
        activeHours: { start: 7, end: 21 },
        enabled: true,
        description: 'Dining area - Meal hours'
    },
    {
        id: 'zone7',
        name: 'Main Gate Area',
        latitude: 22.6865,
        longitude: 75.8605,
        radius: 150,
        color: '#dc3545',
        activeHours: null,
        enabled: true,
        description: 'Main entrance - 24/7 monitoring'
    },
    {
        id: 'zone8',
        name: 'Admin Block',
        latitude: 22.6872,
        longitude: 75.8612,
        radius: 120,
        color: '#20c997',
        activeHours: { start: 9, end: 17 },
        enabled: true,
        description: 'Administration offices - Office hours'
    }
];

window.campusConfig = {
    centerLatitude: 22.6870,
    centerLongitude: 75.8610,
    defaultZoom: 16,
    campusName: 'IET-DAVV Takshashila Campus',
    address: 'Khandwa Road, Indore, Madhya Pradesh 452001',
    emergencyNumbers: {
        security: '0731-XXXXXXX',
        ambulance: '108',
        police: '100',
        women_helpline: '1091'
    }
};

console.log('IET-DAVV zones loaded:', window.safeZones.length);
