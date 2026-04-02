/// Simplified FSRS-5 spaced repetition scheduler.
/// Pure math — no database access, no side effects.
pub struct ScheduleState {
    pub stability: f64,
    pub difficulty: f64,
    pub reps: i64,
    pub lapses: i64,
}

pub struct ScheduleOutput {
    pub next_review_days: i64,
    pub new_stability: f64,
    pub new_difficulty: f64,
    pub new_reps: i64,
    pub new_lapses: i64,
}

/// Calculate the next schedule given the current state and a rating.
/// Rating: 1=Again, 2=Hard, 3=Good, 4=Easy
pub fn schedule(state: &ScheduleState, rating: i32) -> ScheduleOutput {
    // First review (new card) uses fixed intervals
    if state.reps == 0 {
        let days = match rating {
            1 => 1,
            2 => 3,
            3 => 5,
            4 => 10,
            _ => 1,
        };
        return ScheduleOutput {
            next_review_days: days,
            new_stability: days as f64,
            new_difficulty: state.difficulty,
            new_reps: if rating == 1 { 0 } else { 1 },
            new_lapses: if rating == 1 { state.lapses + 1 } else { state.lapses },
        };
    }

    match rating {
        1 => {
            // Again: reset stability, increment lapses
            ScheduleOutput {
                next_review_days: 1,
                new_stability: 1.0,
                new_difficulty: (state.difficulty + 0.2).min(10.0),
                new_reps: state.reps,
                new_lapses: state.lapses + 1,
            }
        }
        2 => {
            // Hard: small stability increase, difficulty increases
            let new_stability = state.stability * 1.2;
            ScheduleOutput {
                next_review_days: (new_stability).ceil() as i64,
                new_stability,
                new_difficulty: (state.difficulty + 0.15).min(10.0),
                new_reps: state.reps + 1,
                new_lapses: state.lapses,
            }
        }
        3 => {
            // Good: standard stability increase, difficulty unchanged
            let new_stability = state.stability * 2.5;
            ScheduleOutput {
                next_review_days: (new_stability).ceil() as i64,
                new_stability,
                new_difficulty: state.difficulty,
                new_reps: state.reps + 1,
                new_lapses: state.lapses,
            }
        }
        4 => {
            // Easy: large stability increase, difficulty decreases
            let new_stability = state.stability * 3.5;
            ScheduleOutput {
                next_review_days: (new_stability).ceil() as i64,
                new_stability,
                new_difficulty: (state.difficulty - 0.15).max(1.0),
                new_reps: state.reps + 1,
                new_lapses: state.lapses,
            }
        }
        _ => {
            // Invalid rating treated as Again
            ScheduleOutput {
                next_review_days: 1,
                new_stability: 1.0,
                new_difficulty: state.difficulty,
                new_reps: state.reps,
                new_lapses: state.lapses + 1,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_card_again() {
        let state = ScheduleState { stability: 1.0, difficulty: 5.0, reps: 0, lapses: 0 };
        let out = schedule(&state, 1);
        assert_eq!(out.next_review_days, 1);
        assert_eq!(out.new_reps, 0); // stays at 0
        assert_eq!(out.new_lapses, 1);
    }

    #[test]
    fn test_new_card_hard() {
        let state = ScheduleState { stability: 1.0, difficulty: 5.0, reps: 0, lapses: 0 };
        let out = schedule(&state, 2);
        assert_eq!(out.next_review_days, 3);
        assert_eq!(out.new_reps, 1);
        assert_eq!(out.new_lapses, 0);
    }

    #[test]
    fn test_new_card_good() {
        let state = ScheduleState { stability: 1.0, difficulty: 5.0, reps: 0, lapses: 0 };
        let out = schedule(&state, 3);
        assert_eq!(out.next_review_days, 5);
        assert_eq!(out.new_reps, 1);
    }

    #[test]
    fn test_new_card_easy() {
        let state = ScheduleState { stability: 1.0, difficulty: 5.0, reps: 0, lapses: 0 };
        let out = schedule(&state, 4);
        assert_eq!(out.next_review_days, 10);
        assert_eq!(out.new_reps, 1);
    }

    #[test]
    fn test_review_again_resets_stability() {
        let state = ScheduleState { stability: 30.0, difficulty: 5.0, reps: 5, lapses: 0 };
        let out = schedule(&state, 1);
        assert_eq!(out.next_review_days, 1);
        assert_eq!(out.new_stability, 1.0);
        assert_eq!(out.new_lapses, 1);
        assert_eq!(out.new_reps, 5); // reps unchanged on lapse
    }

    #[test]
    fn test_review_hard_increases_stability_slightly() {
        let state = ScheduleState { stability: 10.0, difficulty: 5.0, reps: 3, lapses: 0 };
        let out = schedule(&state, 2);
        assert_eq!(out.next_review_days, 12); // ceil(10.0 * 1.2) = 12
        assert!((out.new_stability - 12.0).abs() < 0.01);
        assert!((out.new_difficulty - 5.15).abs() < 0.01);
    }

    #[test]
    fn test_review_good_standard_increase() {
        let state = ScheduleState { stability: 10.0, difficulty: 5.0, reps: 3, lapses: 0 };
        let out = schedule(&state, 3);
        assert_eq!(out.next_review_days, 25); // ceil(10.0 * 2.5) = 25
        assert!((out.new_stability - 25.0).abs() < 0.01);
        assert!((out.new_difficulty - 5.0).abs() < 0.01); // unchanged
    }

    #[test]
    fn test_review_easy_large_increase() {
        let state = ScheduleState { stability: 10.0, difficulty: 5.0, reps: 3, lapses: 0 };
        let out = schedule(&state, 4);
        assert_eq!(out.next_review_days, 35); // ceil(10.0 * 3.5) = 35
        assert!((out.new_difficulty - 4.85).abs() < 0.01);
    }

    #[test]
    fn test_difficulty_capped_at_10() {
        let state = ScheduleState { stability: 5.0, difficulty: 9.95, reps: 2, lapses: 0 };
        let out = schedule(&state, 2); // +0.15 would be 10.1
        assert!((out.new_difficulty - 10.0).abs() < 0.01);
    }

    #[test]
    fn test_difficulty_floored_at_1() {
        let state = ScheduleState { stability: 5.0, difficulty: 1.05, reps: 2, lapses: 0 };
        let out = schedule(&state, 4); // -0.15 would be 0.9
        assert!((out.new_difficulty - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_invalid_rating_treated_as_again() {
        let state = ScheduleState { stability: 10.0, difficulty: 5.0, reps: 3, lapses: 0 };
        let out = schedule(&state, 99);
        assert_eq!(out.next_review_days, 1);
        assert_eq!(out.new_stability, 1.0);
    }

    #[test]
    fn test_again_increases_difficulty() {
        let state = ScheduleState { stability: 10.0, difficulty: 5.0, reps: 3, lapses: 0 };
        let out = schedule(&state, 1);
        assert!((out.new_difficulty - 5.2).abs() < 0.01);
    }
}
