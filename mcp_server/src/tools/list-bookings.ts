import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getDynamoDbClient, TABLE_NAME } from "../services/dynamoDb.js";
import { Booking } from "../types/booking.js";

// Query Functions
async function getBookingsByTenant(tenantId: string): Promise<Booking[]> {
  const dynamoDB = await getDynamoDbClient(tenantId);

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": `${tenantId}`,
    },
  };

  try {
    const command = new QueryCommand(params);
    const result = await dynamoDB.send(command);
    return result.Items as Booking[];
  } catch (error) {
    console.error("Error fetching bookings:", error);
    throw error;
  }
}

async function getBookingsByTenantAndType(
  tenantId: string,
  bookingType: "FLIGHT" | "HOTEL"
): Promise<Booking[]> {
  const dynamoDB = await getDynamoDbClient(tenantId);

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `${tenantId}`,
      ":sk": `BOOKING#${bookingType}`,
    },
  };

  try {
    const command = new QueryCommand(params);
    const result = await dynamoDB.send(command);
    return result.Items as Booking[];
  } catch (error) {
    console.error("Error fetching bookings by type:", error);
    throw error;
  }
}

async function getBookingById(
  tenantId: string,
  bookingId: string
): Promise<Booking | null> {
  const dynamoDB = await getDynamoDbClient(tenantId);

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `${tenantId}`,
      ":sk": `BOOKING#${bookingId}`,
    },
  };

  try {
    const command = new QueryCommand(params);
    const result = await dynamoDB.send(command);
    return (result.Items?.[0] as Booking) || null;
  } catch (error) {
    console.error("Error fetching booking by ID:", error);
    throw error;
  }
}

interface ListBookingsParams {
  type?: "HOTEL" | "FLIGHT" | "ALL";
  id?: string;
}

export const listBookings = async (
  { type, id }: ListBookingsParams,
  { authInfo}
): Promise<CallToolResult> => {
  const tenantId = authInfo.extra.tenantId
  if ( tenantId === undefined)
    return {
      isError: true,
      content: [{ type: "text", text: "ERROR: No tenant ID provided" }],
    };

  if (id !== undefined)
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(await getBookingById(tenantId, id)),
        },
      ],
    };

  if (type === "ALL" || type === undefined)
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(await getBookingsByTenant(tenantId)),
        },
      ],
    };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(await getBookingsByTenantAndType(tenantId, type)),
      },
    ],
  };
};
