import { buildFixFirstList } from "../../lib/fixFirst.js";
import FixFirstList from "./FixFirstList.jsx";
import ScoreBlock from "./ScoreBlock.jsx";

/**
 * The verdict frame: the yellow score block beside the ink "Fix first"
 * panel, or above it when the frame is narrow. With nothing to fix, the
 * panel says so. headingLevel is the level of the frame's two headings: 2
 * on the report, one level below the surrounding section's heading
 * anywhere else. Nothing in it is focusable, so it can also be shown as a
 * static preview.
 */
function VerdictBlock({ report, headingLevel = 2 }) {
  return (
    <div className="verdict">
      <div className="verdict-frame">
        <ScoreBlock report={report} headingLevel={headingLevel} />
        <FixFirstList items={buildFixFirstList(report)} headingLevel={headingLevel} />
      </div>
    </div>
  );
}

export default VerdictBlock;
