import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { metadata } from "../utils/metadata.js";
import { listBookings } from "../tools/list-bookings.js";
import { coerce, z } from "zod";
import { bookFlight, listFlights } from "../tools/manage-flights.js";
import {bookHotel,listHotels} from "../tools/manage-hotels.js";
import { getLoyaltyProgramInfo } from "../tools/frequent-flyer.js";
import { listTenantResources } from "../services/s3.js";
import { getS3File } from "../resources/dynamicS3.js";
import whoami from "../tools/whoami.js";
import log4js from "../utils/logging.js";
import { registerPromptHandlers } from '../prompts/prompts.js';

const l = log4js.getLogger();

const create = () => {
  const mcpServer = new McpServer(
    {
      name: "TravelBookingMCPServer",
      title: "B2B Travel Booking Demo MCP Server",
      version: metadata.version,
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {}
      },
    }
  );

    
  mcpServer.tool(
    "whoami",
    "Returns information about the current user based on their JWT token.",
    whoami
  );

  // Dynamic tenant-specific resource template
  mcpServer.resource(
    "tenant-files",
    new ResourceTemplate("s3://{tenantId}/{filename}", {
      list: async (extra) => {
        const tenantId = extra.authInfo.extra.tenantId;
        const files = await listTenantResources(tenantId);
        
        return {
          resources: files.map(f => ({
            uri: `s3://${tenantId}/${f.filename}`,
            name: f.filename,
            mimeType: f.contentType,
            description: `Tenant file: ${f.filename}`
          }))
        };
      }
    }),
    {
      name: "Tenant S3 Files",
      description: "Access tenant-specific files from S3"
    },
    async (uri, variables, extra) => {
      //Get TenantId always from AuthInfo instead of variables to avoid cross tenant access
      const actualTenantId = extra.authInfo.extra.tenantId;
      const providedTenantId = variables.tenantId;
      const filename = variables.filename;

      //Additional validation check - just for transparency - is enforced above
      if (actualTenantId !== providedTenantId) {
        throw new Error("Access denied: cannot access other tenant's files");
      }
      
      return await getS3File(filename, actualTenantId);
    }
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

  // Register prompt handlers
  registerPromptHandlers(mcpServer);

  return mcpServer;
};

export default{
  create
}