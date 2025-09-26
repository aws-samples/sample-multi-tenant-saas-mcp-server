// Types and Interfaces
export interface Passenger {
  name: string;
  seat: string;
}

export interface BaseBooking {
  PK: string;
  SK: string;
  tenantId: string;
  bookingId: string;
  type: "FLIGHT" | "HOTEL";
  status: "CONFIRMED" | "PENDING" | "CANCELLED";
  bookingDate: string;
  loyaltyInfo?: string;
}

export interface FlightBooking extends BaseBooking {
  type: "FLIGHT";
  flightNumber: string;
  class: string;
  departureDateTime: string;
  passengers: Passenger[];
}

export interface HotelBooking extends BaseBooking {
  type: "HOTEL";
  hotelName: string;
  location: string;
  checkInDate: string;
  checkOutDate: string;
  roomType: string;
  numberOfGuests: number;
}

export type Booking = FlightBooking | HotelBooking;
