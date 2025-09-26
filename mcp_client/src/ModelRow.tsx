import type { Model } from "./models";

const ModelRow = ({ model }: { model: Model }) => {
	// Display only the model ID
	const modelId = model.name;

	return (
		<div className="w-full items-start flex flex-col">
			<div className="font-medium text-sm">{modelId}</div>
		</div>
	);
};

export default ModelRow;
