import type { Character, AptitudeGrade, Stats } from "../../types/character";
import charactersData from "../../../data/characters.json";
import "./CharacterDetail.css";

const characters = charactersData as Character[];

interface Props {
  characterId: string;
  onBack: () => void;
}

export function CharacterDetail({ characterId, onBack }: Props) {
  const character = characters.find((c) => c.id === characterId);

  if (!character) {
    return (
      <div className="character-detail">
        <button className="back-button" onClick={onBack}>
          ← 목록
        </button>
        <p>캐릭터를 찾을 수 없습니다: {characterId}</p>
      </div>
    );
  }

  return (
    <div className="character-detail">
      <button className="back-button" onClick={onBack}>
        ← 목록
      </button>

      <div className="detail-hero">
        {character.images.race ? (
          <img
            className="detail-hero__image"
            src={character.images.race}
            alt={character.name}
          />
        ) : (
          <div className="detail-hero__placeholder">No Image</div>
        )}
        <div className="detail-hero__info">
          <div className="detail-hero__rarity">
            {character.rarity ? "★".repeat(character.rarity) : ""}
          </div>
          <div className="detail-hero__epithet">[{character.epithet}]</div>
          <h2 className="detail-hero__name">{character.name}</h2>
          {character.cv && (
            <div className="detail-hero__cv">CV : {character.cv}</div>
          )}
          <a
            className="detail-hero__source"
            href={character.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            원본 페이지 →
          </a>
        </div>
      </div>

      <div className="detail-columns">
        <section className="detail-section">
          <h3>능력치</h3>
          <StatsTable
            stats={character.stats}
            growthRate={character.growthRate}
          />
        </section>

        <section className="detail-section">
          <h3>적성</h3>
          <AptitudeGrid character={character} />
        </section>
      </div>

      <section className="detail-section">
        <h3>육성 목표 ({character.trainingGoals.length}개)</h3>
        <TrainingGoals goals={character.trainingGoals} />
      </section>
    </div>
  );
}

// ─── 하위 컴포넌트들 ───────────────────

const STAT_LABELS: Record<keyof Stats, string> = {
  speed: "스피드",
  stamina: "스태미나",
  power: "파워",
  guts: "근성",
  wit: "지능",
};

function StatsTable({
  stats,
  growthRate,
}: {
  stats: Character["stats"];
  growthRate: Character["growthRate"];
}) {
  const keys: (keyof Stats)[] = ["speed", "stamina", "power", "guts", "wit"];

  return (
    <table className="stats-table">
      <thead>
        <tr>
          <th></th>
          {keys.map((k) => (
            <th key={k}>{STAT_LABELS[k]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="stats-table__label">초기</td>
          {keys.map((k) => (
            <td key={k}>{stats.initial[k]}</td>
          ))}
        </tr>
        <tr>
          <td className="stats-table__label">5성</td>
          {keys.map((k) => (
            <td key={k}>{stats.max[k]}</td>
          ))}
        </tr>
        <tr>
          <td className="stats-table__label">성장</td>
          {keys.map((k) => {
            const v = growthRate[k];
            return (
              <td key={k} className={v ? "stats-table__growth" : ""}>
                {v ? `+${v}%` : "-"}
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}

function AptitudeGrid({ character }: { character: Character }) {
  const { surface, distance, style } = character.aptitudes;

  return (
    <div className="aptitude-grid">
      <AptitudeRow
        title="경기장"
        items={[
          { label: "잔디", grade: surface.turf },
          { label: "더트", grade: surface.dirt },
        ]}
      />
      <AptitudeRow
        title="거리"
        items={[
          { label: "단거리", grade: distance.sprint },
          { label: "마일", grade: distance.mile },
          { label: "중거리", grade: distance.medium },
          { label: "장거리", grade: distance.long },
        ]}
      />
      <AptitudeRow
        title="각질"
        items={[
          { label: "도주", grade: style.runner },
          { label: "선행", grade: style.leader },
          { label: "선입", grade: style.betweener },
          { label: "추입", grade: style.chaser },
        ]}
      />
    </div>
  );
}

function AptitudeRow({
  title,
  items,
}: {
  title: string;
  items: { label: string; grade: AptitudeGrade }[];
}) {
  return (
    <div className="aptitude-row">
      <div className="aptitude-row__title">{title}</div>
      <div className="aptitude-row__cells">
        {items.map((item) => (
          <div key={item.label} className="aptitude-cell">
            <div className="aptitude-cell__label">{item.label}</div>
            <div
              className={`aptitude-cell__grade apt-grade--${item.grade.toLowerCase()}`}
            >
              {item.grade}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrainingGoals({ goals }: { goals: Character["trainingGoals"] }) {
  if (goals.length === 0) {
    return <p className="muted">육성 목표 정보 없음</p>;
  }

  return (
    <table className="goals-table">
      <thead>
        <tr>
          <th>#</th>
          <th>목표</th>
          <th>기한</th>
          <th>레이스</th>
          <th>필요 팬</th>
        </tr>
      </thead>
      <tbody>
        {goals.map((g) => (
          <tr key={g.order}>
            <td>{g.order}</td>
            <td>{g.description}</td>
            <td>
              {g.deadline
                ? `${g.deadline.class} ${g.deadline.turn.month}월 ${
                    g.deadline.turn.half === 1 ? "전반" : "후반"
                  }`
                : "-"}
            </td>
            <td>
              {g.raceInfo ? (
                <span className="race-info">
                  <span
                    className={`grade-badge grade-badge--${g.raceInfo.grade
                      .toLowerCase()
                      .replace("-", "")}`}
                  >
                    {g.raceInfo.grade}
                  </span>
                  {g.raceInfo.venue} · {g.raceInfo.surface} {g.raceInfo.distance}m
                </span>
              ) : (
                "-"
              )}
            </td>
            <td>{g.requiredFans ? `${g.requiredFans.toLocaleString()}명` : "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}