import { coerce, z } from "zod";
import { listBookings } from "./list-bookings.js";
import { bookFlight, listFlights } from "./manage-flights.js";
import { bookHotel, listHotels } from "./manage-hotels.js";
import { getLoyaltyProgramInfo } from "./frequent-flyer.js";
import whoami from "./whoami.js";

export function registerTools(mcpServer) {
  mcpServer.tool(
    "whoami",
    "Returns information about the current user based on their JWT token.",
    whoami
  );

  mcpServer.tool(
    "list_bookings",
    "Get an overview of a user's bookings and optionally filter them by type or ID.",
    {
      id: z.optional(z.string()),
      type: z.optional(z.enum(["ALL", "HOTEL", "FLIGHT"])),
    },
    listBookings
  );

  mcpServer.tool(
    "find_flights",
    "Search for available flights between two locations on a given date.",
    {
      origin: z.string(),
      destination: z.string(),
      departure: z.string().date(),
    },
    listFlights
  );

  mcpServer.tool(
    "book_flight",
    "Book a flight using its flight number, departure date and time as well as the flight class and an optional frequent flyer number.",
    {
      flightNumber: z.string(),
      departure: z.string().date(),
      flightClass: z.string(),
      frequentFlyerNumber: z.optional(z.string()),
    },
    bookFlight
  );

  mcpServer.tool(
    "book_hotel",
    "Book a hotel room by providing the hotel name, check-in and check-out dates, room type, number of guests (1-10), and an optional loyalty program number",
    {
      hotelName: z.string(),
      checkIn: z.string().date(),
      checkOut: z.string().date(),
      roomType: z.string(),
      guests: coerce.number().int().min(1).max(10).default(1),
      loyaltyNumber: z.optional(z.string()),
    },
    bookHotel
  );

  mcpServer.tool(
    "list_hotels",
    "Search for available hotels in a specified city for given check-in and check-out dates, with the number of guests (1-10).",
    {
      city: z.string(),
      checkIn: z.string().date(),
      checkOut: z.string().date(),
      guests: coerce.number().int().min(1).max(10).default(1),
    },
    listHotels
  );

  mcpServer.tool(
    "loyalty_info",
    "Get the user's participation status in Airline and Hotel Loyalty programs",
    getLoyaltyProgramInfo
  );
}
