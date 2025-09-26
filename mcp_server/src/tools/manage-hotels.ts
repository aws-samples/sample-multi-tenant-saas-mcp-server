import { faker } from "@faker-js/faker";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getDynamoDbClient, TABLE_NAME } from "../services/dynamoDb.js";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { HotelBooking } from "../types/booking.js";

export interface HotelInfo {
  checkIn: Date;
  checkOut: Date;
  hotelName: string;
  location: {
    address: string;
    city: string;
    country: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  rating: number;
  availableRooms: {
    roomType: string;
    bedType: string;
    occupancy: {
      max: number;
      recommended: number;
    };
    amenities: string[];
    pricePerNight: number;
    available: number;
  }[];
  facilities: string[];
  loyaltyProgram: {
    programName: string;
    pointsEarned: number;
    tierPointsEarned: number;
  };
}

const HOTEL_CHAINS = ["Marriott", "Hilton", "Hyatt", "IHG"];
const ROOM_TYPES = ["Standard", "Deluxe", "Suite", "Presidential Suite"];
const BED_TYPES = ["King", "Queen", "Twin", "Double"];
const AMENITIES = [
  "WiFi",
  "Mini Bar",
  "Ocean View",
  "Balcony",
  "Kitchen",
  "Jacuzzi",
  "Work Desk",
  "Dog Friendly",
];
const FACILITIES = [
  "Pool",
  "Spa",
  "Gym",
  "Restaurant",
  "Bar",
  "Business Center",
  "Conference Rooms",
];
const LOYALTY_PROGRAMS = {
  Marriott: "Bonvoy",
  Hilton: "Honors",
  Hyatt: "World of Hyatt",
  IHG: "One Rewards",
};

interface CreateHotelBookingInput {
  hotelName: string;
  location: string;
  checkInDate: string;
  checkOutDate: string;
  roomType: string;
  numberOfGuests: number;
  status: "CONFIRMED" | "PENDING" | "CANCELLED";
  loyaltyInfo?: string;
}

async function createHotelBooking(
  tenantId: string,
  input: CreateHotelBookingInput
): Promise<HotelBooking> {
  const dynamoDB = await getDynamoDbClient(tenantId);
  const bookingId = faker.string.alphanumeric({
    length: 6,
    casing: "upper",
  });

  const booking: HotelBooking = {
    PK: `${tenantId}`,
    SK: `BOOKING#HOTEL#${bookingId}`,
    tenantId: tenantId,
    bookingId: bookingId,
    type: "HOTEL",
    status: input.status,
    bookingDate: new Date().toISOString(),
    hotelName: input.hotelName,
    location: input.location,
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    roomType: input.roomType,
    numberOfGuests: input.numberOfGuests,
    loyaltyInfo: input.loyaltyInfo,
  };

  const params = {
    TableName: TABLE_NAME,
    Item: booking,
  };

  try {
    const command = new PutCommand(params);
    await dynamoDB.send(command);
    return booking;
  } catch (error) {
    console.error("Error creating hotel booking:", error);
    throw error;
  }
}

export async function listHotels({
  city,
  checkIn,
  checkOut,
  guests,
}): Promise<CallToolResult> {
  const hotelCount = 4;
  const hotels: HotelInfo[] = [];

  for (let i = 0; i < hotelCount; i++) {
    const hotelChain = faker.helpers.arrayElement(HOTEL_CHAINS);

    const hotel: HotelInfo = {
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      hotelName: `${hotelChain} ${faker.location.city()}`,
      location: {
        address: faker.location.streetAddress(),
        city: city,
        country: faker.location.country(),
        coordinates: {
          latitude: +faker.location.latitude(),
          longitude: +faker.location.longitude(),
        },
      },
      rating: faker.number.float({ min: 3, max: 5, fractionDigits: 1 }),
      availableRooms: ROOM_TYPES.map((type) => ({
        roomType: type,
        bedType: faker.helpers.arrayElement(BED_TYPES),
        occupancy: {
          max: faker.number.int({ min: 2, max: 6 }),
          recommended: faker.number.int({ min: 1, max: 4 }),
        },
        amenities: faker.helpers.arrayElements(AMENITIES, {
          min: 2,
          max: 5,
        }),
        pricePerNight: faker.number.int({ min: 100, max: 1000 }),
        available: faker.number.int({ min: 0, max: 10 }),
      })),
      facilities: faker.helpers.arrayElements(FACILITIES, {
        min: 3,
        max: 7,
      }),
      loyaltyProgram: {
        programName: LOYALTY_PROGRAMS[hotelChain],
        pointsEarned: faker.number.int({ min: 500, max: 5000 }),
        tierPointsEarned: faker.number.int({ min: 50, max: 500 }),
      },
    };
    hotels.push(hotel);
  }

  return {
    isError: false,
    content: [
      {
        type: "text",
        text: JSON.stringify(hotels),
      },
    ],
  };
}

export async function bookHotel(
  {
    hotelName,
    checkIn,
    checkOut,
    roomType,
    guests,
    loyaltyNumber,
  }: {
    hotelName: string;
    checkIn: Date;
    checkOut: Date;
    roomType: string;
    guests: number;
    loyaltyNumber?: string;
  },
  { authInfo }
) {
  const tenantId = authInfo.extra.tenantId
  const scenario = faker.number.int({ min: 1, max: 4 });

  switch (scenario) {
    case 1:
      // Successful booking
      const booking = await createHotelBooking(tenantId, {
        checkInDate: checkIn.toString(),
        checkOutDate: checkOut.toString(),
        hotelName,
        roomType,
        numberOfGuests: guests,
        status: "CONFIRMED",
        loyaltyInfo: loyaltyNumber,
        location: faker.location.city(),
      });

      const loyaltyMessage = loyaltyNumber
        ? `Loyalty number ${loyaltyNumber} has been added to your booking.`
        : "";
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Booking successful! Your confirmation number is ${booking.bookingId}. ${loyaltyMessage}`,
          },
        ],
      };

    case 2:
      // Payment failed
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "ERROR: Payment processing failed. Please try a different payment method.",
          },
        ],
      };

    case 3:
      // Room unavailable
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "ERROR: We apologize, but this room type is no longer available for your selected dates.",
          },
        ],
      };

    case 4:
      // Invalid dates
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "ERROR: The selected dates are invalid or outside the booking window.",
          },
        ],
      };
  }
}

export async function modifyHotelBooking({
  confirmationNumber,
  modification,
}: {
  confirmationNumber: string;
  modification: {
    type: "CHANGE_DATES" | "UPGRADE_ROOM" | "MODIFY_GUESTS" | "ADD_SERVICES";
    newCheckIn?: Date;
    newCheckOut?: Date;
    newRoomType?: string;
    guestCount?: number;
    additionalServices?: string[];
  };
}) {
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const scenario = faker.number.int({ min: 1, max: 3 });

  switch (scenario) {
    case 1:
      // Successful modification
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Booking ${confirmationNumber} has been successfully modified. ${
              modification.type === "UPGRADE_ROOM"
                ? "Room upgraded successfully."
                : modification.type === "CHANGE_DATES"
                ? "Dates updated successfully."
                : modification.type === "MODIFY_GUESTS"
                ? "Guest count updated successfully."
                : "Additional services added successfully."
            }`,
          },
        ],
      };

    case 2:
      // Modification not available
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "ERROR: The requested modification is not available for this booking.",
          },
        ],
      };

    case 3:
      // Invalid confirmation number
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "ERROR: Invalid confirmation number. Please check and try again.",
          },
        ],
      };
  }
}
