export type TaxonomySeedDepartment = {
  slug: string;
  name_az: string;
  name_en?: string;
  subdepartments: Array<{
    slug: string;
    name_az: string;
    name_en?: string;
    positions: Array<{
      slug: string;
      name_az: string;
      name_en?: string;
    }>;
  }>;
};

export const TAXONOMY_SEED: TaxonomySeedDepartment[] = [
  {
    slug: 'food-beverage',
    name_az: 'Qida və İçki Şöbəsi',
    name_en: 'Food & Beverage Department',
    subdepartments: [
      {
        slug: 'restaurant',
        name_az: 'Restaurant',
        name_en: 'Restaurant',
        positions: [
          { slug: 'restaurant-manager', name_az: 'Restoran meneceri', name_en: 'Restaurant Manager' },
          { slug: 'host-hostess', name_az: 'Host/Hostes', name_en: 'Host/Hostess' },
          { slug: 'waiter-waitress', name_az: 'Ofisiant', name_en: 'Waiter/Waitress' },
          { slug: 'runner', name_az: 'Servis köməkçisi', name_en: 'Runner' },
        ],
      },
      {
        slug: 'banquet',
        name_az: 'Banquet',
        name_en: 'Banquet',
        positions: [
          { slug: 'banquet-manager', name_az: 'Banket meneceri', name_en: 'Banquet Manager' },
          { slug: 'banquet-waiter', name_az: 'Banket ofisiantı', name_en: 'Banquet Waiter' },
        ],
      },
      {
        slug: 'room-service',
        name_az: 'Room Service / In-Room Dining',
        name_en: 'Room Service / In-Room Dining',
        positions: [
          { slug: 'room-service-attendant', name_az: 'Otaq servisi əməkdaşı', name_en: 'Room Service Attendant' },
        ],
      },
      {
        slug: 'bar',
        name_az: 'Bar',
        name_en: 'Bar',
        positions: [
          { slug: 'bar-waiter', name_az: 'Bar ofisiantı', name_en: 'Bar Waiter' },
          { slug: 'bartender', name_az: 'Barmen', name_en: 'Bartender' },
          { slug: 'bar-back', name_az: 'Barmen köməkçisi', name_en: 'Bar Back' },
        ],
      },
    ],
  },
  {
    slug: 'housekeeping',
    name_az: 'Təmizlik Şöbəsi',
    name_en: 'Housekeeping Department',
    subdepartments: [
      {
        slug: 'room-cleaning',
        name_az: 'Room Cleaning',
        name_en: 'Room Cleaning',
        positions: [
          { slug: 'housekeeping-supervisor', name_az: 'Təmizlik supervayzeri', name_en: 'Housekeeping Supervisor' },
          { slug: 'room-attendant', name_az: 'Otaq təmizləyicisi', name_en: 'Room Attendant' },
        ],
      },
      {
        slug: 'public-areas',
        name_az: 'Public Areas',
        name_en: 'Public Areas',
        positions: [
          { slug: 'public-area-attendant', name_az: 'İctimai sahə təmizləyicisi', name_en: 'Public Area Attendant' },
        ],
      },
      {
        slug: 'laundry',
        name_az: 'Laundry',
        name_en: 'Laundry',
        positions: [
          { slug: 'laundry-attendant', name_az: 'Camaşırxana əməkdaşı', name_en: 'Laundry Attendant' },
        ],
      },
    ],
  },
  {
    slug: 'spa-wellness',
    name_az: 'SPA və Wellness Şöbəsi',
    name_en: 'SPA & Wellness Department',
    subdepartments: [
      {
        slug: 'spa',
        name_az: 'SPA',
        name_en: 'SPA',
        positions: [
          { slug: 'spa-receptionist', name_az: 'SPA resepsionisti', name_en: 'SPA Receptionist' },
          { slug: 'spa-attendant', name_az: 'SPA əməkdaşı', name_en: 'SPA Attendant' },
        ],
      },
    ],
  },
  {
    slug: 'front-office',
    name_az: 'Ön Büro Şöbəsi',
    name_en: 'Front Office Department',
    subdepartments: [
      {
        slug: 'reception',
        name_az: 'Reception',
        name_en: 'Reception',
        positions: [
          { slug: 'receptionist-front-desk-agent', name_az: 'Resepsionist', name_en: 'Receptionist/Front Desk Agent' },
        ],
      },
      {
        slug: 'concierge-bell-service',
        name_az: 'Concierge & Bell Service',
        name_en: 'Concierge & Bell Service',
        positions: [
          { slug: 'bellboy', name_az: 'Baqajçı', name_en: 'Bellboy' },
        ],
      },
    ],
  },
  {
    slug: 'engineering-maintenance',
    name_az: 'Texniki Xidmət Şöbəsi',
    name_en: 'Engineering & Maintenance Department',
    subdepartments: [
      {
        slug: 'general-maintenance',
        name_az: 'General Maintenance',
        name_en: 'General Maintenance',
        positions: [
          { slug: 'maintenance-technician', name_az: 'Texniki işçi', name_en: 'Maintenance Technician' },
        ],
      },
    ],
  },
  {
    slug: 'kitchen',
    name_az: 'Mətbəx Şöbəsi',
    name_en: 'Kitchen Department',
    subdepartments: [
      {
        slug: 'hot-cold-kitchen',
        name_az: 'Hot and Cold Kitchen',
        name_en: 'Hot and Cold Kitchen',
        positions: [
          { slug: 'sous-chef', name_az: 'Su-şef', name_en: 'Sous Chef' },
          { slug: 'demi-chef-de-partie', name_az: 'Demi şef de parti', name_en: 'Demi Chef de Partie' },
          { slug: 'hot-kitchen-chef', name_az: 'İsti mətbəx aşpazı', name_en: 'Hot Kitchen Chef' },
          { slug: 'cold-kitchen-chef', name_az: 'Soyuq mətbəx aşpazı', name_en: 'Cold Kitchen Chef' },
          { slug: 'chef-de-partie', name_az: 'Şef de parti', name_en: 'Chef de Partie' },
          { slug: 'commis-chef', name_az: 'Aşpaz köməkçisi', name_en: 'Commis Chef' },
        ],
      },
      {
        slug: 'pastry-bakery',
        name_az: 'Pastry & Bakery',
        name_en: 'Pastry & Bakery',
        positions: [
          { slug: 'pastry-chef', name_az: 'Şirniyyat aşpazı', name_en: 'Pastry Chef' },
          { slug: 'baker', name_az: 'Çörəkçi', name_en: 'Baker' },
          { slug: 'pastry-commis-chef', name_az: 'Şirniyyat aşpaz köməkçisi', name_en: 'Pastry Commis Chef' },
        ],
      },
      {
        slug: 'azerbaijani-cuisine',
        name_az: 'Azerbaijani Cuisine',
        name_en: 'Azerbaijani Cuisine',
        positions: [
          { slug: 'bbq-chef', name_az: 'Qril aşpazı', name_en: 'BBQ Chef' },
        ],
      },
      {
        slug: 'butchery',
        name_az: 'Butchery',
        name_en: 'Butchery',
        positions: [
          { slug: 'butcher', name_az: 'Qəssab', name_en: 'Butcher' },
        ],
      },
      {
        slug: 'stewarding',
        name_az: 'Stewarding',
        name_en: 'Stewarding',
        positions: [
          { slug: 'steward-dishwasher', name_az: 'Qabyuyan', name_en: 'Steward/Dishwasher' },
        ],
      },
      {
        slug: 'pizza-section',
        name_az: 'Pizza Section',
        name_en: 'Pizza Section',
        positions: [
          { slug: 'pizza-chef', name_az: 'Pizza aşpazı', name_en: 'Pizza Chef' },
        ],
      },
      {
        slug: 'sushi-section',
        name_az: 'Sushi Section',
        name_en: 'Sushi Section',
        positions: [
          { slug: 'sushi-chef', name_az: 'Suşi aşpazı', name_en: 'Sushi Chef' },
        ],
      },
      {
        slug: 'asian-kitchen',
        name_az: 'Asian Kitchen',
        name_en: 'Asian Kitchen',
        positions: [
          { slug: 'wok-chef', name_az: 'Vok aşpazı', name_en: 'Wok Chef' },
          { slug: 'asian-cuisine-chef', name_az: 'Asiya mətbəxi aşpazı', name_en: 'Asian Cuisine Chef' },
        ],
      },
      {
        slug: 'italian-kitchen',
        name_az: 'Italian Kitchen',
        name_en: 'Italian Kitchen',
        positions: [
          { slug: 'italian-cuisine-chef', name_az: 'İtalyan mətbəxi aşpazı', name_en: 'Italian Cuisine Chef' },
        ],
      },
    ],
  },
  {
    slug: 'information-technology',
    name_az: 'İnformasiya Texnologiyaları Şöbəsi',
    name_en: 'Information Technology Department',
    subdepartments: [
      {
        slug: 'it-support',
        name_az: 'IT Support',
        name_en: 'IT Support',
        positions: [
          { slug: 'av-specialist', name_az: 'AV mütəxəssisi', name_en: 'AV Specialist' },
        ],
      },
    ],
  },
  {
    slug: 'purchasing-stores',
    name_az: 'Satınalma və Anbar Şöbəsi',
    name_en: 'Purchasing & Stores Department',
    subdepartments: [
      {
        slug: 'warehouse-stores',
        name_az: 'Warehouse / Stores',
        name_en: 'Warehouse / Stores',
        positions: [
          { slug: 'storekeeper', name_az: 'Anbardar', name_en: 'Storekeeper' },
        ],
      },
    ],
  },
];
