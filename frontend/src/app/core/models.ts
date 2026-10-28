/** Modelos compartidos del frontend (reflejan las respuestas del API). */

export type Role = 'superadmin' | 'owner' | 'staff' | 'customer';

export interface AuthUser {
  id: string;
  role: Role;
  tenantId: string | null;
  email: string | null;
  fullName: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  slug?: string;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  priceCop: number;
  isActive?: boolean;
}

export interface PublicSite {
  name: string;
  timezone: string;
  branding: {
    logoUrl?: string | null;
    primaryColor: string;
    secondaryColor: string;
    phone?: string | null;
    whatsappNumber?: string | null;
    email?: string | null;
    address?: string | null;
    about?: string | null;
  } | null;
  services: Service[];
}

export interface AvailabilityOption {
  staffId: string;
  slots: string[];
}

export interface Availability {
  date: string;
  duration: number;
  options: AvailabilityOption[];
}

export interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'booked' | 'confirmed' | 'completed' | 'no_show' | 'cancelled';
  serviceName: string;
  staffName?: string;
  customerName?: string;
  customerPhone?: string;
}

export interface LoyaltyCard {
  enabled: boolean;
  stickers: number;
  rewardsEarned: number;
  threshold: number;
  rewardLabel: string;
}

export interface Plan {
  id: string;
  name: string;
  priceCop: number;
  maxStaff: number;
  maxBranches: number;
  maxServices: number;
  features: Record<string, unknown>;
  isActive: boolean;
  sortOrder: number;
}

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'suspended';
  subStatus?: string;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  planName?: string;
}
