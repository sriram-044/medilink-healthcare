const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { BadRequestError } = require('../utils/errors');

/**
 * Verified healthcare and trauma facilities in CareLink ecosystem.
 * Includes geographic coordinates, emergency hotlines, and real-time ICU capacities.
 */
const REGISTERED_HOSPITALS = [
  {
    id: 'HOSP-ML-01',
    name: 'MediLink Central Trauma & Emergency Center',
    address: '42 Healthcare Corridor, Central Avenue',
    phone: '+91 98765 00108',
    latitude: 13.0827,
    longitude: 80.2707,
    traumaLevel: 'Level 1 Comprehensive Trauma Center',
    emergencyServicesAvailable: true,
    emergencyHotline: '108',
    icuBedsAvailable: 14,
    oxygenBaysAvailable: 28,
    bloodBankAvailable: true,
    rating: 4.9
  },
  {
    id: 'HOSP-AP-02',
    name: 'Apollo Emergency Care Center',
    address: '21 Greams Lane, Thousand Lights',
    phone: '+91 98765 43210',
    latitude: 13.0604,
    longitude: 80.2496,
    traumaLevel: 'Level 1 Trauma Center',
    emergencyServicesAvailable: true,
    emergencyHotline: '+91 44 2829 0200',
    icuBedsAvailable: 18,
    oxygenBaysAvailable: 35,
    bloodBankAvailable: true,
    rating: 4.8
  },
  {
    id: 'HOSP-SN-03',
    name: 'Sunrise Specialty Clinic & Acute Care',
    address: '88 Sunrise Park Road, Anna Nagar',
    phone: '+91 98765 43219',
    latitude: 13.0850,
    longitude: 80.2101,
    traumaLevel: 'Level 2 Regional Trauma Center',
    emergencyServicesAvailable: true,
    emergencyHotline: '+91 98765 43219',
    icuBedsAvailable: 6,
    oxygenBaysAvailable: 12,
    bloodBankAvailable: false,
    rating: 4.6
  },
  {
    id: 'HOSP-CG-04',
    name: 'City General Hospital (Operations Hub)',
    address: '105 Metro Boulevard, North Sector',
    phone: '+91 98765 11223',
    latitude: 13.0900,
    longitude: 80.2800,
    traumaLevel: 'Level 2 Emergency Trauma Center',
    emergencyServicesAvailable: true,
    emergencyHotline: '+91 98765 11223',
    icuBedsAvailable: 9,
    oxygenBaysAvailable: 20,
    bloodBankAvailable: true,
    rating: 4.7
  },
  {
    id: 'HOSP-FT-05',
    name: 'Fortis Memorial Emergency Pavilion',
    address: '77 Cross Cut Road, Gandhinagar',
    phone: '+91 98765 88990',
    latitude: 13.0450,
    longitude: 80.2520,
    traumaLevel: 'Level 1 Comprehensive Cardiac & Trauma Center',
    emergencyServicesAvailable: true,
    emergencyHotline: '+91 98765 88990',
    icuBedsAvailable: 16,
    oxygenBaysAvailable: 24,
    bloodBankAvailable: true,
    rating: 4.9
  },
  {
    id: 'HOSP-MX-06',
    name: 'Max Super Specialty Hospital',
    address: '14 Outer Ring Road, South Sector',
    phone: '+91 98765 77665',
    latitude: 12.9800,
    longitude: 80.2200,
    traumaLevel: 'Level 1 Trauma Center',
    emergencyServicesAvailable: true,
    emergencyHotline: '+91 98765 77665',
    icuBedsAvailable: 11,
    oxygenBaysAvailable: 18,
    bloodBankAvailable: true,
    rating: 4.8
  },
  {
    id: 'HOSP-ND-07',
    name: 'North District Trauma Center',
    address: '56 Expressway Junction, North Hub',
    phone: '+91 98765 30002',
    latitude: 13.1200,
    longitude: 80.2600,
    traumaLevel: 'Level 2 Urgent Trauma Center',
    emergencyServicesAvailable: true,
    emergencyHotline: '+91 98765 30002',
    icuBedsAvailable: 8,
    oxygenBaysAvailable: 15,
    bloodBankAvailable: true,
    rating: 4.5
  }
];

/**
 * Calculates geographic distance in kilometers using the Haversine formula.
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's mean radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // Round to 1 decimal place
}

/**
 * GET /api/hospitals/nearby — Find healthcare and trauma facilities near a GPS coordinate.
 *
 * Query Parameters:
 *   - lat: Latitude (-90 to 90) [Required]
 *   - lng: Longitude (-180 to 180) [Required]
 *   - radius: Search radius in km (Default: 10, min: 0.5, max: 100)
 *   - type: Optional filter ('all', 'trauma', 'icu')
 */
router.get('/nearby', auth, async (req, res, next) => {
  try {
    const { lat, lng, radius = 10, type = 'all' } = req.query;

    if (lat === undefined || lat === null || lat === '') {
      return next(new BadRequestError("Missing required query parameter: 'lat' (latitude)."));
    }

    if (lng === undefined || lng === null || lng === '') {
      return next(new BadRequestError("Missing required query parameter: 'lng' (longitude)."));
    }

    const latitude = Number(lat);
    const longitude = Number(lng);

    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
      return next(new BadRequestError("Invalid 'lat'. Must be a valid number between -90 and 90."));
    }

    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
      return next(new BadRequestError("Invalid 'lng'. Must be a valid number between -180 and 180."));
    }

    let searchRadius = Number(radius);
    if (isNaN(searchRadius) || searchRadius <= 0) {
      searchRadius = 10;
    }
    if (searchRadius > 100) searchRadius = 100;

    // Calculate distance to each registered hospital
    const mappedHospitals = REGISTERED_HOSPITALS.map(hospital => {
      const distanceKm = calculateDistanceKm(latitude, longitude, hospital.latitude, hospital.longitude);
      // Rough travel time estimate: ~35 km/h urban emergency transit
      const estimatedTravelMinutes = Math.max(3, Math.round((distanceKm / 35) * 60));

      return {
        ...hospital,
        distanceKm,
        estimatedTravelMinutes,
        directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${hospital.latitude},${hospital.longitude}`,
        openStreetMapUrl: `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${latitude}%2C${longitude}%3B${hospital.latitude}%2C${hospital.longitude}`
      };
    });

    // Filter by type if requested
    let filtered = mappedHospitals;
    if (type === 'trauma') {
      filtered = filtered.filter(h => h.traumaLevel.includes('Level 1'));
    } else if (type === 'icu') {
      filtered = filtered.filter(h => h.icuBedsAvailable > 10);
    }

    // Filter within search radius and sort by distance ascending
    const inRadius = filtered
      .filter(h => h.distanceKm <= searchRadius)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    // If no facilities within radius, find closest facility to provide actionable guidance
    const closestFacility = mappedHospitals.slice().sort((a, b) => a.distanceKm - b.distanceKm)[0];

    const message = inRadius.length > 0
      ? `Found ${inRadius.length} hospital facility(ies) within ${searchRadius} km.`
      : `No hospitals found within ${searchRadius} km. Nearest facility is ${closestFacility.name} at ${closestFacility.distanceKm} km. Try expanding your search radius.`;

    res.json({
      success: true,
      searchCoordinates: { latitude, longitude },
      searchRadiusKm: searchRadius,
      totalFound: inRadius.length,
      hospitals: inRadius,
      closestFacility: inRadius.length === 0 ? closestFacility : null,
      message
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/hospitals — List all registered hospital facilities in CareLink network
 */
router.get('/', auth, async (_req, res, next) => {
  try {
    res.json({
      success: true,
      total: REGISTERED_HOSPITALS.length,
      hospitals: REGISTERED_HOSPITALS
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
