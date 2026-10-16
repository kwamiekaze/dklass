export interface Package {
  id: string;
  label: string;
  price: string;
  description: string;
  squareUrl: string;
  positionIndex: number;
}

// Single source of truth for all packages
// Circle order: Start at top with 1 HR, then move clockwise
export const PACKAGES: Package[] = [
  {
    id: "1hr",
    label: "1 HR",
    price: "$69.00",
    description: "One hour Driving Klass package. This package includes one hour behind-the-wheel, with convenient pick-up and drop-off from your home, workplace, or school.",
    squareUrl: "https://square.link/u/8N9tghIt?src=sheet",
    positionIndex: 0,
  },
  {
    id: "2hr",
    label: "2 HR",
    price: "$120.00",
    description: "Two hour Session Driving Package. This package includes one 2 hour behind-the-wheel, with convenient pick-up and drop-off from your home, workplace, or school.",
    squareUrl: "https://square.link/u/g4KCpO6x?src=sheet",
    positionIndex: 1,
  },
  {
    id: "4hr",
    label: "4 HR",
    price: "$230.00",
    description: "Two Sessions Driving Package. This package includes two (2), two-hour behind-the-wheel, with convenient pick-up and drop-off from your home, workplace, or school.",
    squareUrl: "https://square.link/u/p0Oq0ixi?src=sheet",
    positionIndex: 2,
  },
  {
    id: "6hr",
    label: "6 HR",
    price: "$340.00",
    description: "Three Sessions Driving Package. This package includes three, two-hour behind-the-wheel, with convenient pick-up and drop-off from your home, workplace, or school.",
    squareUrl: "https://square.link/u/VVU6Chyu?src=sheet",
    positionIndex: 3,
  },
  {
    id: "8hr",
    label: "8 HR",
    price: "$450.00",
    description: "Four Sessions Driving Package. This package includes four (4), two-hour behind-the-wheel, with convenient pick-up and drop-off from your home, workplace, or school.",
    squareUrl: "https://square.link/u/M2d0Bcmb?src=sheet",
    positionIndex: 4,
  },
  {
    id: "10hr",
    label: "10 HR",
    price: "$550.00",
    description: "Five Sessions Driving Package. This package includes five (5), two-hour behind-the-wheel, with convenient pick-up and drop-off from your home, workplace, or school.",
    squareUrl: "https://square.link/u/28AM0b1q?src=sheet",
    positionIndex: 5,
  },
  {
    id: "20hr",
    label: "20 HR",
    price: "$1,099.00",
    description: "Ten Sessions Driving Package. This package includes ten (10), two-hour behind-the-wheel, with convenient pick-up and drop-off from your home, workplace, or school.",
    squareUrl: "https://square.link/u/2Xc6wddZ?src=sheet",
    positionIndex: 6,
  },
  {
    id: "30hr",
    label: "30 HR",
    price: "$1,650.00",
    description: "Fifteen Sessions Driving Package. This package includes fifteen (15), two-hour behind-the-wheel, with convenient pick-up and drop-off from your home, workplace, or school.",
    squareUrl: "https://square.link/u/itUqGMaP?src=sheet",
    positionIndex: 7,
  },
  {
    id: "40hr",
    label: "40 HR",
    price: "$2,199.00",
    description: "20 Sessions Driving Package. This package includes twenty (20), two-hour behind-the-wheel, with convenient pick-up and drop-off from your home, workplace, or school.",
    squareUrl: "https://square.link/u/QHMAG8Fg?src=sheet",
    positionIndex: 8,
  },
  {
    id: "1hr-rdtest",
    label: "1 HR +\nRD TEST",
    price: "$160.00",
    description: "This package includes a 1 hour driving session directly before testing. You'll have access to a clean, dual-pedal compact car, full insurance coverage, and road test appointment scheduling assistance. Package also features free pick-up & drop-off within a 25-mile testing radius.",
    squareUrl: "https://square.link/u/ZyC0fvzG?src=sheet",
    positionIndex: 9,
  },
  {
    id: "2hr-rdtest",
    label: "2 HR +\nRD TEST",
    price: "$200.00",
    description: "This package includes a 2 hour driving session directly before testing. You'll have access to a clean, dual-pedal compact car, full insurance coverage, and road test appointment scheduling assistance. Package also features free pick-up & drop-off within a 25-mile testing radius.",
    squareUrl: "https://square.link/u/SkNKhwAv?src=sheet",
    positionIndex: 10,
  },
];

// Get packages sorted by position for circle layout
export const getPackagesSortedByPosition = () => 
  [...PACKAGES].sort((a, b) => a.positionIndex - b.positionIndex);

export const getPackageById = (id: string) => 
  PACKAGES.find(p => p.id === id);
