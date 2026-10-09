import { buildFixFirstList } from "../../lib/fixFirst.js";
import FixFirstList from "./FixFirstList.jsx";
import ScoreBlock from "./ScoreBlock.jsx";

/**
 * The verdict frame: the yellow score block beside the ink "Fix first"
 * panel, or above it when the frame is narrow. The panel is left out when
 * there is nothing to fix. headingLevel is the level of the frame's two
 * headings: 2 on the report, one level below the surrounding section's
 * heading anywhere else. Nothing in it is focusable, so it can also be shown
 * as a static preview.
 */
function VerdictBlock({ report, headingLevel = 2 }) {
  const fixFirstItems = buildFixFirstList(report);

  return (
    <div className="verdict">
      <div className="verdict-frame">
        <ScoreBlock report={report} headingLevel={headingLevel} />
        {fixFirstItems.length > 0 && (
          <FixFirstList items={fixFirstItems} headingLevel={headingLevel} />
        )}
      </div>
    </div>
  );
}

export default VerdictBlock;
