import { useCombobox } from "downshift";
import { useEffect, useRef, useState } from "react";

import ModelRow from "./ModelRow";
import type { Model } from "./models";

const ModelSelector = ({
	models,
	model,
	onModelSelection,
}: {
	models: Model[];
	model: Model | undefined;
	onModelSelection: (model: Model | null) => void;
}) => {
	const [inputItems, setInputItems] = useState(models);
	const [inputValue, setInputValue] = useState("");
	const [selectedItem, setSelectedItem] = useState<Model | null>(model || null);

	const inputRef = useRef<HTMLInputElement>(null);

	// Clean up old filter state from sessionStorage on component mount
	useEffect(() => {
		sessionStorage.removeItem("modelFilters");
	}, []);

	useEffect(() => {
		setInputItems(models);
		setSelectedItem(model || null);
	}, [models, model]);

	useEffect(() => {
		// Apply search filter
		let filteredItems = models;

		if (inputValue) {
			filteredItems = filteredItems.filter((model) => 
				model.name.toLowerCase().includes(inputValue.toLowerCase()) ||
				model.description.toLowerCase().includes(inputValue.toLowerCase())
			);
		}

		setInputItems(filteredItems);

		// Check if the currently selected model is still in the filtered list
		if (
			selectedItem &&
			filteredItems.length > 0 &&
			!filteredItems.some((item) => item.name === selectedItem.name)
		) {
			// Find the model with the newest created_at date
			const newestModel = filteredItems.reduce((newest, current) => {
				if (!newest.created_at) return current;
				if (!current.created_at) return newest;
				return new Date(current.created_at) > new Date(newest.created_at)
					? current
					: newest;
			}, filteredItems[0]);

			// Update the selected model to the newest one
			onModelSelection(newestModel);
			setSelectedItem(newestModel);
		} else if (filteredItems.length === 0 && selectedItem) {
			// If no models match the filter and something is selected, clear selection
			onModelSelection(null);
			setSelectedItem(null);
		}
	}, [inputValue, models, selectedItem, onModelSelection]);

	const {
		isOpen,
		getToggleButtonProps,
		getLabelProps,
		getMenuProps,
		getInputProps,
		highlightedIndex,
		getItemProps,
	} = useCombobox({
		inputValue,
		items: inputItems,
		itemToString: (item) => item?.name || "",
		onInputValueChange: ({ inputValue, type }) => {
			if (type === useCombobox.stateChangeTypes.InputChange) {
				setInputValue(inputValue || "");
			}
		},
		onSelectedItemChange: ({ selectedItem: newSelectedItem }) => {
			// Update parent state
			onModelSelection(newSelectedItem);

			// Update local state
			setSelectedItem(newSelectedItem);

			// Blur search to reset filtering
			inputRef.current?.blur();
		},
	});

	return (
		<div className="relative">
			<div className="mb-1">
				{/* biome-ignore lint/a11y/noLabelWithoutControl: it's fine */}
				<label {...getLabelProps()} className="font-semibold text-sm">
					Model
				</label>
			</div>
			<div className="bg-white flex justify-between cursor-pointer w-full border border-gray-200 p-3 rounded-md relative">
				{isOpen || inputValue ? (
					<input
						className="flex-1 bg-transparent outline-none"
						{...getInputProps({ ref: inputRef })}
						placeholder="Search models..."
						onBlur={() => {
							setInputValue("");
						}}
					/>
				) : selectedItem ? (
					<>
						<input
							className="absolute left-3 top-3 right-10 bg-transparent outline-none opacity-0 pointer-events-none"
							{...getInputProps({ ref: inputRef })}
							onBlur={() => {
								setInputValue("");
							}}
						/>
						<ModelRow model={selectedItem} />
					</>
				) : (
					<input
						className="flex-1 bg-transparent outline-none"
						{...getInputProps({ ref: inputRef })}
						placeholder="Select a model..."
						onBlur={() => {
							setInputValue("");
						}}
					/>
				)}
				<span className="px-2" {...getToggleButtonProps()}>
					{isOpen ? <>&#8593;</> : <>&#8595;</>}
				</span>
			</div>
			<ul
				className={`absolute left-0 right-0 bg-white mt-1 border border-gray-200 px-2 py-2 rounded-md shadow-lg max-h-80 overflow-scroll z-10 ${
					!isOpen && "hidden"
				}`}
				{...getMenuProps()}
			>
				{isOpen && inputItems.length === 0 && (
					<li className={"py-2 px-3 flex flex-col rounded-md"}>No models found</li>
				)}
				{isOpen &&
					inputItems.map((item, index) => (
						<li
							className={`py-2 px-3 flex flex-col rounded-md ${
								selectedItem === item && "font-bold"
							} ${highlightedIndex === index && "bg-gray-100"}`}
							key={item.id}
							{...getItemProps({ index, item })}
						>
							<ModelRow model={item} />
						</li>
					))}
			</ul>
		</div>
	);
};

export default ModelSelector;
