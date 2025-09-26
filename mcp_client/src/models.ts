export type Model = {
	id: string;
	source: number;
	name: string;
	description: string;
	task: {
		id: string;
		name: string;
		description: string;
	};
	created_at: string;
	tags: string[];
	properties: {
		property_id: string;
		value: string;
	}[];
	finetunes?: FineTune[];
};

export type FineTune = {
	id: string;
	name: string;
	description: string;
	created_at: string;
	modified_at: string;
	public: number;
	model: string;
};

// Import the models data
import bedrockModelsData from "./bedrock-models.json";

// Cast to proper type and export
export const models: Model[] = bedrockModelsData as Model[];
