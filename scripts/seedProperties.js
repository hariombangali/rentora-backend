/* eslint-disable no-console */
// Seed 40 Indore properties (flats, rooms, PGs, hostels). Idempotent by title.
// Usage: node server/scripts/seedProperties.js

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Property = require("../models/Property");
const User = require("../models/User");

const MONGO_URI = process.env.MONGO_URI;

// Indore localities with approximate lat/lng and a default price band
const AREAS = {
  "Vijay Nagar":     { lat: 22.7536, lng: 75.8936, pin: "452010", band: [15000, 35000] },
  "Palasia":         { lat: 22.7249, lng: 75.8879, pin: "452001", band: [12000, 28000] },
  "Scheme 54":       { lat: 22.7502, lng: 75.8987, pin: "452010", band:  [8000, 22000] },
  "Sapna Sangeeta":  { lat: 22.7063, lng: 75.8741, pin: "452001", band: [18000, 32000] },
  "Nipania":         { lat: 22.7675, lng: 75.9031, pin: "452010", band:  [6000, 18000] },
  "AB Road":         { lat: 22.7196, lng: 75.8577, pin: "452008", band: [20000, 40000] },
  "Khajrana":        { lat: 22.7476, lng: 75.9031, pin: "452016", band:  [5000, 15000] },
  "Bhawarkua":       { lat: 22.6937, lng: 75.8620, pin: "452014", band:  [5000, 14000] },
  "Geeta Bhawan":    { lat: 22.7107, lng: 75.8837, pin: "452001", band: [10000, 22000] },
  "Annapurna":       { lat: 22.6942, lng: 75.8425, pin: "452009", band:  [8000, 18000] },
  "South Tukoganj":  { lat: 22.7271, lng: 75.8810, pin: "452001", band: [18000, 32000] },
  "Saket Nagar":     { lat: 22.7325, lng: 75.8969, pin: "452018", band: [10000, 22000] },
  "Manorama Ganj":   { lat: 22.7188, lng: 75.8722, pin: "452001", band: [14000, 28000] },
  "Super Corridor":  { lat: 22.7900, lng: 75.8300, pin: "453112", band: [14000, 30000] },
  "Tilak Nagar":     { lat: 22.7037, lng: 75.8678, pin: "452018", band: [10000, 20000] },
  "New Palasia":     { lat: 22.7265, lng: 75.8880, pin: "452001", band: [15000, 30000] },
  "Mahalaxmi Nagar": { lat: 22.7425, lng: 75.8925, pin: "452010", band: [12000, 25000] },
  "Bicholi Mardana": { lat: 22.7320, lng: 75.9140, pin: "452016", band:  [7000, 16000] },
  "Rau":             { lat: 22.6410, lng: 75.8230, pin: "453331", band:  [6000, 14000] },
  "LIG Colony":      { lat: 22.7361, lng: 75.8850, pin: "452008", band: [11000, 22000] },
};

const FLAT_IMAGES = [
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1560184897-ae75f418493e?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200&q=80&auto=format&fit=crop",
];
const ROOM_IMAGES = [
  "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?w=1200&q=80&auto=format&fit=crop",
];
const PG_IMAGES = [
  "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1564540583246-934409427776?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1585128792020-803d29415281?w=1200&q=80&auto=format&fit=crop",
];
const HOSTEL_IMAGES = [
  "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1541123437800-1bb1317badc2?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=1200&q=80&auto=format&fit=crop",
];

const COMMON_AMENITIES_FLAT = ["Power backup", "Lift", "Covered parking", "24x7 water", "CCTV", "Gym", "Park", "Visitor parking"];
const COMMON_AMENITIES_PG = ["Wi-Fi", "Laundry", "Housekeeping", "Meals included", "RO water", "CCTV", "Power backup"];
const COMMON_AMENITIES_HOSTEL = ["Study room", "Wi-Fi", "Mess", "Hot water", "Warden", "CCTV"];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const priceInBand = (area, factor = 1) => {
  const [lo, hi] = AREAS[area].band;
  const raw = rand(lo, hi) * factor;
  return Math.round(raw / 500) * 500;
};
const sample = (arr, n) => {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(rand(0, copy.length - 1), 1)[0]);
  return out;
};

// 40-item seed catalog. Mix of types.
const SEEDS = [
  // ---------- 15 FLATS ----------
  { kind: "flat", area: "Vijay Nagar", title: "Skyline 2BHK in Vijay Nagar",     bhk: 2 },
  { kind: "flat", area: "Vijay Nagar", title: "Premium 3BHK near C21 Mall",      bhk: 3 },
  { kind: "flat", area: "Palasia",     title: "Palash Residency 2BHK",           bhk: 2 },
  { kind: "flat", area: "New Palasia", title: "1BHK Loft at New Palasia",        bhk: 1 },
  { kind: "flat", area: "Scheme 54",   title: "Scheme 54 Studio Apartment",      bhk: 1 },
  { kind: "flat", area: "Scheme 54",   title: "2BHK near Scheme 54 Market",      bhk: 2 },
  { kind: "flat", area: "Sapna Sangeeta", title: "Sapna Sangeeta Luxury 3BHK",   bhk: 3 },
  { kind: "flat", area: "AB Road",     title: "AB Road 2BHK with City View",     bhk: 2 },
  { kind: "flat", area: "AB Road",     title: "Brand-new 3BHK on AB Road",       bhk: 3 },
  { kind: "flat", area: "Nipania",     title: "Nipania Garden 1BHK",             bhk: 1 },
  { kind: "flat", area: "Saket Nagar", title: "Saket Nagar 2BHK Family Flat",    bhk: 2 },
  { kind: "flat", area: "Super Corridor", title: "IT-Park Facing 2BHK",          bhk: 2 },
  { kind: "flat", area: "Mahalaxmi Nagar", title: "Mahalaxmi Nagar Spacious 3BHK", bhk: 3 },
  { kind: "flat", area: "Manorama Ganj", title: "Manorama Ganj Classic 2BHK",    bhk: 2 },
  { kind: "flat", area: "South Tukoganj", title: "South Tukoganj Heritage 2BHK", bhk: 2 },

  // ---------- 10 ROOMS ----------
  { kind: "room", area: "Bhawarkua",   title: "Single room near DAVV Campus" },
  { kind: "room", area: "Bhawarkua",   title: "Furnished room for bachelors" },
  { kind: "room", area: "Geeta Bhawan", title: "Private room in Geeta Bhawan" },
  { kind: "room", area: "Annapurna",   title: "Quiet room near Annapurna Temple" },
  { kind: "room", area: "Khajrana",    title: "Budget room in Khajrana" },
  { kind: "room", area: "Rau",         title: "Spacious room near IET-DAVV, Rau" },
  { kind: "room", area: "Tilak Nagar", title: "Tilak Nagar furnished room" },
  { kind: "room", area: "Bicholi Mardana", title: "Room in gated society, Bicholi" },
  { kind: "room", area: "LIG Colony",  title: "LIG Colony 1-room setup" },
  { kind: "room", area: "Vijay Nagar", title: "Single room in Vijay Nagar PG area" },

  // ---------- 10 PGs ----------
  { kind: "pg", area: "Bhawarkua",   title: "Boys PG with meals near DAVV",        forWhom: "Boys" },
  { kind: "pg", area: "Bhawarkua",   title: "Girls PG opposite IET Campus",        forWhom: "Girls" },
  { kind: "pg", area: "Vijay Nagar", title: "Vijay Nagar Working-Professional PG", forWhom: "Any", working: true },
  { kind: "pg", area: "Palasia",     title: "Palasia Ladies PG Premium",           forWhom: "Girls" },
  { kind: "pg", area: "Scheme 54",   title: "Scheme 54 Co-living PG",              forWhom: "Any", working: true },
  { kind: "pg", area: "Geeta Bhawan", title: "Geeta Bhawan Gents PG",              forWhom: "Boys" },
  { kind: "pg", area: "Annapurna",   title: "Homely PG near Annapurna",            forWhom: "Girls" },
  { kind: "pg", area: "Khajrana",    title: "Budget PG in Khajrana",               forWhom: "Boys" },
  { kind: "pg", area: "Nipania",     title: "Nipania Executive PG",                forWhom: "Any", working: true },
  { kind: "pg", area: "Saket Nagar", title: "Saket Nagar Girls PG with mess",      forWhom: "Girls" },

  // ---------- 5 HOSTELS ----------
  { kind: "hostel", area: "Bhawarkua", title: "Shrinath Boys Hostel, Bhawarkua",    forWhom: "Boys" },
  { kind: "hostel", area: "Annapurna", title: "Annapurna Girls Hostel",             forWhom: "Girls" },
  { kind: "hostel", area: "Rau",       title: "IET-DAVV Boys Hostel, Rau",          forWhom: "Boys" },
  { kind: "hostel", area: "Khajrana",  title: "Khajrana Low-Cost Student Hostel",   forWhom: "Any" },
  { kind: "hostel", area: "Geeta Bhawan", title: "Geeta Bhawan MBA Girls Hostel",   forWhom: "Girls" },
];

function buildProperty(s, ownerId) {
  const area = AREAS[s.area];
  const base = {
    user: ownerId,
    location: {
      city: "Indore",
      locality: s.area,
      address: `Plot ${rand(1, 400)}, ${s.area}, Indore`,
      pincode: area.pin,
      point: {
        type: "Point",
        // jitter within ~500m
        coordinates: [area.lng + (Math.random() - 0.5) * 0.005, area.lat + (Math.random() - 0.5) * 0.005],
      },
    },
    availableFrom: new Date(Date.now() + rand(0, 30) * 24 * 3600 * 1000),
    approved: true,
    rejected: false,
    active: true,
  };

  if (s.kind === "flat") {
    const priceFactor = s.bhk === 1 ? 0.85 : s.bhk === 2 ? 1 : 1.25;
    return {
      ...base,
      title: s.title,
      description: `A ${s.bhk}BHK ${pick(["modern", "airy", "elegantly finished", "peaceful"])} flat in ${s.area}, Indore. ${pick([
        "Close to shops and schools.",
        "Great connectivity to AB Road and the ring road.",
        "Spacious balcony with city view.",
        "Ideal for families and working couples.",
      ])}`,
      availableFor: "Any",
      preferredTenants: pick(["Working Professionals", "Any"]),
      occupancyType: "Single",
      sharingCount: "1",
      bedrooms: s.bhk,
      attachedBathroom: "Yes",
      attachedBalcony: pick(["Yes", "No"]),
      furnishing: pick(["Fully furnished", "Semi-furnished", "Unfurnished"]),
      ageOfProperty: pick(["0 - 1 Year", "1 - 5 Years", "5 - 10 Years"]),
      totalFloors: rand(3, 12),
      propertyOnFloor: rand(1, 8),
      price: priceInBand(s.area, priceFactor),
      deposit: priceInBand(s.area, priceFactor) * 2,
      maintenance: rand(500, 2500),
      maintenanceFreq: "Monthly",
      minContractDuration: "11 Months",
      noticePeriod: "1 Month",
      commonAreaFacilities: sample(COMMON_AMENITIES_FLAT, rand(3, 6)),
      pgAmenities: [],
      images: sample(FLAT_IMAGES, rand(3, 5)),
    };
  }

  if (s.kind === "room") {
    return {
      ...base,
      title: s.title,
      description: `A private room in ${s.area}, Indore. ${pick([
        "Perfect for a working professional or student.",
        "Close to bus stop, mess, and market.",
        "Quiet neighbourhood, separate entrance.",
        "Furnished with bed, study table, cupboard, and fan.",
      ])}`,
      availableFor: pick(["Boys", "Girls", "Any"]),
      preferredTenants: pick(["Students", "Working Professionals", "Any"]),
      occupancyType: "Single",
      sharingCount: "1",
      bedrooms: 1,
      attachedBathroom: pick(["Yes", "No"]),
      attachedBalcony: "No",
      furnishing: pick(["Semi-furnished", "Fully furnished"]),
      ageOfProperty: pick(["1 - 5 Years", "5 - 10 Years"]),
      totalFloors: rand(1, 4),
      propertyOnFloor: rand(1, 3),
      price: priceInBand(s.area, 0.55),
      deposit: priceInBand(s.area, 0.55),
      maintenance: 0,
      maintenanceFreq: "Monthly",
      minContractDuration: "3 Months",
      noticePeriod: "1 Month",
      commonAreaFacilities: sample(["24x7 water", "Power backup", "CCTV", "Wi-Fi"], rand(2, 3)),
      pgAmenities: [],
      images: sample(ROOM_IMAGES, rand(2, 4)),
    };
  }

  if (s.kind === "pg") {
    return {
      ...base,
      title: s.title,
      description: `A PG in ${s.area}, Indore with ${pick([
        "homely meals and weekly laundry",
        "24x7 Wi-Fi and power backup",
        "study rooms and friendly wardens",
        "mess, housekeeping, and RO water",
      ])}. ${s.working ? "Working professionals welcome." : "Students and early-career folks welcome."}`,
      availableFor: s.forWhom || "Any",
      preferredTenants: s.working ? "Working Professionals" : pick(["Students", "Any"]),
      occupancyType: pick(["Single", "Shared", "Both"]),
      sharingCount: pick(["2", "3"]),
      bedrooms: 1,
      attachedBathroom: pick(["Yes", "No"]),
      attachedBalcony: "No",
      furnishing: "Fully furnished",
      ageOfProperty: pick(["0 - 1 Year", "1 - 5 Years"]),
      totalFloors: rand(2, 5),
      propertyOnFloor: rand(1, 4),
      price: priceInBand(s.area, 0.45),
      deposit: priceInBand(s.area, 0.45),
      maintenance: 0,
      maintenanceFreq: "Monthly",
      minContractDuration: "1 Month",
      noticePeriod: "1 Month",
      commonAreaFacilities: [],
      pgAmenities: sample(COMMON_AMENITIES_PG, rand(4, 6)),
      images: sample(PG_IMAGES, rand(2, 4)),
    };
  }

  // hostel
  return {
    ...base,
    title: s.title,
    description: `Hostel in ${s.area}, Indore for ${s.forWhom === "Boys" ? "boys" : s.forWhom === "Girls" ? "girls" : "students"}. ${pick([
      "Mess serves 3 meals a day.",
      "Strict in-time with warden.",
      "Close to college and coaching hubs.",
      "Study rooms and Wi-Fi on every floor.",
    ])}`,
    availableFor: s.forWhom || "Any",
    preferredTenants: "Students",
    occupancyType: "Shared",
    sharingCount: pick(["3", "4", "5+"]),
    bedrooms: 1,
    attachedBathroom: "No",
    attachedBalcony: "No",
    furnishing: "Semi-furnished",
    ageOfProperty: pick(["1 - 5 Years", "5 - 10 Years"]),
    totalFloors: rand(3, 5),
    propertyOnFloor: rand(1, 5),
    price: priceInBand(s.area, 0.35),
    deposit: priceInBand(s.area, 0.35),
    maintenance: 0,
    maintenanceFreq: "Monthly",
    minContractDuration: "6 Months",
    noticePeriod: "1 Month",
    commonAreaFacilities: [],
    pgAmenities: sample(COMMON_AMENITIES_HOSTEL, rand(3, 5)),
    images: sample(HOSTEL_IMAGES, rand(2, 3)),
  };
}

async function ensureOwner() {
  let owner = await User.findOne({ email: "owner@rentora.in" });
  if (owner) return owner._id;
  const hashed = await bcrypt.hash("owner123", 10);
  owner = await User.create({
    name: "Rentora Sample Owner",
    email: "owner@rentora.in",
    password: hashed,
    contact: "+91 90000 00001",
    role: "owner",
    ownerVerified: true,
  });
  console.log("→ Created sample owner user:", owner.email);
  return owner._id;
}

async function main() {
  if (!MONGO_URI) {
    console.error("Missing MONGO_URI in .env");
    process.exit(1);
  }
  console.log("Connecting to MongoDB…");
  await mongoose.connect(MONGO_URI);
  console.log("Connected.");

  const ownerId = await ensureOwner();

  let inserted = 0;
  let skipped = 0;
  // Make first ~10 featured across types
  const featuredSet = new Set();
  const featuredTitles = [
    "Skyline 2BHK in Vijay Nagar",
    "Palash Residency 2BHK",
    "Sapna Sangeeta Luxury 3BHK",
    "AB Road 2BHK with City View",
    "Scheme 54 Studio Apartment",
    "Vijay Nagar Working-Professional PG",
    "Palasia Ladies PG Premium",
    "Nipania Garden 1BHK",
    "Mahalaxmi Nagar Spacious 3BHK",
    "IT-Park Facing 2BHK",
  ];
  featuredTitles.forEach((t) => featuredSet.add(t));

  for (const s of SEEDS) {
    const existing = await Property.findOne({ title: s.title });
    if (existing) {
      skipped += 1;
      continue;
    }
    const doc = buildProperty(s, ownerId);
    doc.featured = featuredSet.has(s.title);
    await Property.create(doc);
    inserted += 1;
  }

  console.log(`Done. Inserted: ${inserted} · Skipped (already exist): ${skipped} · Total seeds: ${SEEDS.length}`);
  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error("Seed failed:", err);
  try { await mongoose.connection.close(); } catch (_) {}
  process.exit(1);
});
