import { faker } from "@faker-js/faker";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Define interfaces for our types
interface LoyaltyProgram {
  programName: string;
  membershipNumber: string;
  currentPoints: number;
  currentTier: string;
  nextTier: string;
  pointsToNextTier: number;
}

interface UserLoyaltyPrograms {
  airlines: {
    [key: string]: LoyaltyProgram;
  };
  hotels: {
    [key: string]: LoyaltyProgram;
  };
}

export async function getLoyaltyProgramInfo(): Promise<CallToolResult> {
  // Define tiers for each program
  const airlineTiers = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
  const hotelTiers = ["Member", "Silver", "Gold", "Platinum", "Ambassador"];

  function createLoyaltyProgram(
    programName: string,
    isTiersHotel: boolean
  ): LoyaltyProgram {
    const tiers = isTiersHotel ? hotelTiers : airlineTiers;
    const currentTierIndex = faker.number.int({
      min: 0,
      max: tiers.length - 2,
    });

    return {
      programName,
      membershipNumber: faker.string.alphanumeric({
        length: 9,
        casing: "upper",
      }),
      currentPoints: faker.number.int({ min: 10000, max: 500000 }),
      currentTier: tiers[currentTierIndex],
      nextTier: tiers[currentTierIndex + 1],
      pointsToNextTier: faker.number.int({ min: 1000, max: 50000 }),
    };
  }

  return {
    isError: false,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          airlines: {
            Delta: createLoyaltyProgram("SkyMiles", false),
            United: createLoyaltyProgram("MileagePlus", false),
            American: createLoyaltyProgram("AAdvantage", false),
            Southwest: createLoyaltyProgram("Rapid Rewards", false),
          },
          hotels: {
            Marriott: createLoyaltyProgram("Bonvoy", true),
            Hilton: createLoyaltyProgram("Honors", true),
            Hyatt: createLoyaltyProgram("World of Hyatt", true),
            IHG: createLoyaltyProgram("One Rewards", true),
          },
        }),
      },
    ],
  };
}
