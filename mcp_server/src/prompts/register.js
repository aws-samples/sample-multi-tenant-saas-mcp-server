import { z } from "zod";

export function registerPrompts(mcpServer) {
  mcpServer.registerPrompt(
    'flight_search',
    {
      title: 'Flight Search',
      description: 'Guide for searching flights with preferences',
      argsSchema: {
        origin: z.string().describe('Departure city or airport code'),
        destination: z.string().describe('Arrival city or airport code'),
        date: z.string().describe('Travel date (YYYY-MM-DD)'),
        preferences: z.string().optional().describe('Travel preferences (e.g., nonstop, morning)'),
      }
    },
    ({ origin, destination, date, preferences }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I'll help you search for flights from ${origin} to ${destination} on ${date}.

Let me search for available options using the flight search tool.

Use find_flights with origin: "${origin}", destination: "${destination}", departure: "${date}"

Based on your preferences: ${preferences || 'any flight is fine'}

I'll analyze the results and highlight:
1. Best value options
2. Most convenient times
3. Loyalty program benefits
4. Available seat classes

Would you like me to search for return flights as well?`
        }
      }]
    })
  );

  mcpServer.registerPrompt(
    'booking_flow',
    {
      title: 'Booking Flow',
      description: 'Complete travel booking workflow with policy compliance',
    },
    () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I'll guide you through the complete travel booking process.

First, let's check your current bookings to avoid conflicts using list_bookings.

Next, I'll need to know:
1. Your travel dates and destination
2. Whether you need flights, hotels, or both
3. Your budget preferences
4. Any loyalty programs you want to use

Once we have your preferences, I'll:
- Search for the best options
- Compare prices and benefits
- Check policy compliance
- Handle the booking

What type of trip are you planning?`
        }
      }]
    })
  );

  mcpServer.registerPrompt(
    'loyalty_overview',
    {
      title: 'Loyalty Overview',
      description: 'Check all loyalty program statuses',
    },
    () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Let me check all your loyalty program statuses using loyalty_info.

I'll provide you with:
- Current points/miles balance for each program
- Your tier status and benefits
- Points needed for next tier
- Recommendations for maximizing rewards

This will help you choose the best airline or hotel for earning and redeeming points.`
        }
      }]
    })
  );

  mcpServer.registerPrompt(
    'policy_compliant_booking',
    {
      title: 'Policy Compliant Booking',
      description: 'Book travel following company policy',
      argsSchema: {
        trip_type: z.string().describe('Type of trip: business or personal'),
        budget: z.string().optional().describe('Maximum budget for the trip'),
      }
    },
    ({ trip_type, budget }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I'll help you book ${trip_type} travel while ensuring compliance with company policy.

Key policy points to consider:
- Approved vendors and booking classes
- Per diem limits and expense guidelines
- Advance booking requirements
- Required approvals

${budget ? `Your specified budget is ${budget}. ` : ''}I'll ensure all bookings comply with these guidelines.

What are your travel dates and destination?`
        }
      }]
    })
  );

  mcpServer.registerPrompt(
    'hotel_search',
    {
      title: 'Hotel Search',
      description: 'Search for available hotels in a city with preferences',
      argsSchema: {
        city: z.string().describe('City name to search for hotels'),
        checkIn: z.string().describe('Check-in date (YYYY-MM-DD)'),
        checkOut: z.string().describe('Check-out date (YYYY-MM-DD)'),
        guests: z.string().optional().describe('Number of guests (1-10)'),
      }
    },
    ({ city, checkIn, checkOut, guests }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I'll help you find hotels in ${city} for your stay from ${checkIn} to ${checkOut}.

Let me search for available accommodations using list_hotels with city: "${city}", checkIn: "${checkIn}", checkOut: "${checkOut}", guests: ${guests || '1'}

I'll show you hotels with:
1. Best rates and availability
2. Location and distance to city center
3. Amenities and ratings
4. Loyalty program benefits

Would you like me to filter by specific amenities or price range?`
        }
      }]
    })
  );

  mcpServer.registerPrompt(
    'book_flight_demo',
    {
      title: 'Book Flight Demo',
      description: 'Demonstrate flight booking process with specific flight details',
      argsSchema: {
        flightNumber: z.string().describe('Flight number to book'),
        departure: z.string().describe('Departure date (YYYY-MM-DD)'),
        flightClass: z.string().describe('Flight class (economy, business, first)'),
        frequentFlyerNumber: z.string().optional().describe('Frequent flyer number'),
      }
    },
    ({ flightNumber, departure, flightClass, frequentFlyerNumber }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I'll proceed with booking flight ${flightNumber} on ${departure} in ${flightClass} class.

First, let me check your current bookings to avoid conflicts using list_bookings.

Now I'll process your flight booking using book_flight with flightNumber: "${flightNumber}", departure: "${departure}", flightClass: "${flightClass}"${frequentFlyerNumber ? `, frequentFlyerNumber: "${frequentFlyerNumber}"` : ''}

I'll provide you with:
- Booking confirmation details
- Total cost and payment information
- Frequent flyer miles earned
- Next steps for check-in`
        }
      }]
    })
  );

  mcpServer.registerPrompt(
    'book_hotel_demo',
    {
      title: 'Book Hotel Demo',
      description: 'Demonstrate hotel booking process with specific hotel details',
      argsSchema: {
        hotelName: z.string().describe('Hotel name to book'),
        checkIn: z.string().describe('Check-in date (YYYY-MM-DD)'),
        checkOut: z.string().describe('Check-out date (YYYY-MM-DD)'),
        roomType: z.string().describe('Room type (standard, deluxe, suite)'),
        guests: z.string().optional().describe('Number of guests (1-10)'),
        loyaltyNumber: z.string().optional().describe('Hotel loyalty program number'),
      }
    },
    ({ hotelName, checkIn, checkOut, roomType, guests, loyaltyNumber }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I'll proceed with booking ${hotelName} from ${checkIn} to ${checkOut} for a ${roomType} room.

First, let me check your existing reservations using list_bookings.

Now I'll process your hotel reservation using book_hotel with hotelName: "${hotelName}", checkIn: "${checkIn}", checkOut: "${checkOut}", roomType: "${roomType}", guests: ${guests || '1'}${loyaltyNumber ? `, loyaltyNumber: "${loyaltyNumber}"` : ''}

I'll provide you with:
- Reservation confirmation number
- Total cost and payment details
- Loyalty points earned
- Hotel amenities and policies`
        }
      }]
    })
  );
}
