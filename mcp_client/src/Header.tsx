/** biome-ignore-all lint/nursery/useUniqueElementIds: it's fine */
/** biome-ignore-all lint/a11y/noStaticElementInteractions: it's fine */
import { useAuth } from "./contexts/AuthContext";

interface HeaderProps {
	onSetCodeVisible: (visible: boolean) => void;
}

const Header = ({ onSetCodeVisible }: HeaderProps) => {
	const { user, signOut } = useAuth();

	return (
		<div className="md:flex py-5 hidden">
			<div className="ml-auto flex items-center space-x-3">
				{user && (
					<div className="flex items-center space-x-2 px-3 py-2 bg-green-50 border border-green-200 rounded-md">
						<div className="w-2 h-2 bg-green-500 rounded-full"></div>
						<span className="text-sm text-green-800 font-medium">{user.username}</span>
						<button
							onClick={signOut}
							className="text-xs text-green-600 hover:text-green-800 underline ml-2"
						>
							Sign Out
						</button>
					</div>
				)}
				<a
					className="hover:bg-gray-50 text-sm cursor-pointer font-sm px-3 py-2 bg-white border border-gray-200 rounded-md shadow-sm flex items-center"
					href="https://docs.aws.amazon.com/bedrock/"
					target="_blank"
					rel="noreferrer"
				>
					Amazon Bedrock Docs
					<svg
						className="ml-1"
						width="19"
						height="19"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<title>Amazon Bedrock Logo</title>
						<path
							d="M12 2L2 7L12 12L22 7L12 2Z"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<path
							d="M2 17L12 22L22 17"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<path
							d="M2 12L12 17L22 12"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</a>
				<a
					className="hover:bg-gray-50 text-sm cursor-pointer font-sm px-3 py-2 bg-white border border-gray-200 rounded-md shadow-sm flex items-center"
					href="https://github.com/modelcontextprotocol"
					target="_blank"
					rel="noreferrer"
				>
					MCP Protocol
					<svg
						className="ml-1"
						width="19"
						height="19"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<title>MCP Protocol</title>
						<path
							d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</a>
			</div>
		</div>
	);
};

export default Header;
