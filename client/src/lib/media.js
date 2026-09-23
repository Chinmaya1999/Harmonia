// Photography by Unsplash contributors (Unsplash License), bundled locally in /public/img.
export const CATEGORY_MEDIA = {
  ELEC: { img: '/img/elec.jpg', alt: '/img/elec-2.jpg', tag: 'Most booked' },
  PLMB: { img: '/img/plmb.jpg', alt: '/img/plmb-2.jpg', tag: 'Fast response' },
  ACRP: { img: '/img/acrp.jpg', alt: '/img/acrp-2.jpg', tag: 'Summer ready' },
  CARP: { img: '/img/carp.jpg', alt: '/img/carp-2.jpg' },
  DCLN: { img: '/img/dcln.jpg', alt: '/img/dcln-2.jpg', tag: 'Scheduled' },
  TUTR: { img: '/img/tutr.jpg', alt: '/img/tutr.jpg' },
  ITSP: { img: '/img/itsp.jpg', alt: '/img/itsp.jpg' },
};

export const catImg = (code, which = 'img') => CATEGORY_MEDIA[code]?.[which] || '/img/room.jpg';

export const SCENES = {
  room: '/img/room.jpg',
  room2: '/img/room-2.jpg',
  room3: '/img/room-3.jpg',
  family: '/img/family.jpg',
  proAtWork: '/img/elec-2.jpg',
  community: '/img/community.jpg',
  customer: '/img/customer.jpg',
  customer2: '/img/customer-2.jpg',
  couple: '/img/couple.jpg',
};
