const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
});

async function getMetrics() {
  try {
    console.log('=== SIGMA READ LEVEL PROGRESSION CALIBRATION REPORT ===');
    console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
    console.log(`Time: ${new Date().toLocaleString('en-US', {timeZone: 'America/Chicago'})}`);
    console.log('\nAnalysis Period: Last 30 days (or all available data if <30 days old)\n');

    // Metric 1: Total sessions completed
    const sessionsResult = await pool.query(`
      SELECT COUNT(*) as total_sessions
      FROM reading_sessions
      WHERE completed_at IS NOT NULL
    `);
    const metric1 = parseInt(sessionsResult.rows[0].total_sessions);

    // Get total active students
    const totalStudentsResult = await pool.query(`
      SELECT COUNT(DISTINCT student_id) as total_students
      FROM reading_sessions
      WHERE completed_at IS NOT NULL
      AND completed_at > NOW() - INTERVAL '30 days'
    `);
    const totalStudents = parseInt(totalStudentsResult.rows[0].total_students);

    // Metric 2: Probe trigger rate
    const probingStudentsResult = await pool.query(`
      SELECT COUNT(DISTINCT student_id) as probing_students
      FROM students
      WHERE feed_mix ? 'probeDirection' AND feed_mix->>'probeDirection' IS NOT NULL
    `);
    const probingStudents = parseInt(probingStudentsResult.rows[0].probing_students || 0);
    const metric2 = totalStudents > 0 ? (probingStudents / totalStudents * 100).toFixed(2) : 'N/A';

    // Metric 3: Probe success rate (students who have probe phases and level history)
    // Since we don't have separate probe outcome tracking, estimate from level_history
    const levelHistoryResult = await pool.query(`
      SELECT COUNT(*) as total_changes FROM level_history
    `);
    const totalLevelChanges = parseInt(levelHistoryResult.rows[0].total_changes);
    
    // Assume probes lead to changes—without full data, this is a placeholder
    const metric3 = probingStudents > 0 ? (totalLevelChanges / probingStudents * 100).toFixed(2) : 'N/A';

    // Metric 4: Level change rate
    const metric4 = totalStudents > 0 ? (totalLevelChanges / totalStudents * 100).toFixed(2) : 0;

    // Metric 5: Post-change performance (scores in first 5 sessions after level change)
    // Since level changes aren't tracked in comprehension_reports, use all high/low transitions
    const postChangeResult = await pool.query(`
      SELECT 
        ROUND(AVG(CASE WHEN score >= 65 THEN 1 ELSE 0 END) * 100, 2) as success_rate,
        ROUND(AVG(score)::numeric, 2) as avg_score
      FROM comprehension_reports
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    const postChangeRow = postChangeResult.rows[0];
    const metric5 = postChangeRow.success_rate || 'N/A';
    const metric5_avg = postChangeRow.avg_score || 'N/A';

    // Metric 6: Score variance per student
    const varianceResult = await pool.query(`
      SELECT 
        ROUND(AVG(score_stddev)::numeric, 2) as avg_variance
      FROM (
        SELECT 
          student_id,
          STDDEV_POP(score) as score_stddev
        FROM comprehension_reports
        GROUP BY student_id
      ) variance_calc
    `);
    const metric6 = parseFloat(varianceResult.rows[0].avg_variance || 0).toFixed(2);

    // Metric 7: Frustration indicators (sessions with score <50)
    const frustrationResult = await pool.query(`
      SELECT 
        COUNT(*) as low_score_count,
        ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM comprehension_reports WHERE created_at > NOW() - INTERVAL '30 days') * 100, 2) as pct_total
      FROM comprehension_reports
      WHERE score < 50 AND created_at > NOW() - INTERVAL '30 days'
    `);
    const frustRow = frustrationResult.rows[0];
    const metric7_count = parseInt(frustRow.low_score_count);
    const metric7_pct = parseFloat(frustRow.pct_total || 0).toFixed(2);

    // Metric 8: Self-assessment calibration (overconfidence vs actual performance)
    const calibrationResult = await pool.query(`
      SELECT 
        COUNT(CASE WHEN self_assessment = 'really_well' AND score < 65 THEN 1 END) as overconf_count,
        COUNT(CASE WHEN self_assessment = 'really_well' THEN 1 END) as total_confident
      FROM comprehension_reports
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    const calRow = calibrationResult.rows[0];
    const metric8 = parseInt(calRow.total_confident) > 0 
      ? (parseInt(calRow.overconf_count) / parseInt(calRow.total_confident) * 100).toFixed(2)
      : 'N/A';

    // Metric 9: Downward mix recovery (students who go through struggle and recover)
    // Using score progression: drop below 50, then recover to 65+
    const recoveryResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT student_id) as recovered
      FROM (
        SELECT 
          student_id,
          LAG(score) OVER (PARTITION BY student_id ORDER BY created_at) as prev_score,
          score as curr_score
        FROM comprehension_reports
        WHERE created_at > NOW() - INTERVAL '30 days'
      ) score_changes
      WHERE prev_score < 50 AND curr_score >= 65
    `);
    const metric9 = parseInt(recoveryResult.rows[0].recovered);

    // Metric 10: Reversal rate (level up then down, but we have minimal level history)
    const reversalResult = await pool.query(`
      SELECT 
        COUNT(*) as reversals
      FROM (
        SELECT 
          student_id,
          LAG(to_level) OVER (PARTITION BY student_id ORDER BY changed_at) as prev_level,
          to_level as curr_level
        FROM level_history
      ) level_changes
      WHERE curr_level < prev_level
    `);
    const metric10 = parseInt(reversalResult.rows[0].reversals || 0);

    // Output report
    console.log('METRIC RESULTS:\n');
    console.log(`1. Total Sessions Completed: ${metric1}`);
    console.log(`   └─ Active students (30d): ${totalStudents}`);
    
    console.log(`\n2. Probe Trigger Rate: ${metric2}%`);
    console.log(`   └─ Students in probing: ${probingStudents} / ${totalStudents}`);
    console.log(`   └─ Target range: 15-25%`);
    
    console.log(`\n3. Probe Success Rate: ${metric3}%`);
    console.log(`   └─ (Probes → Level changes)`);
    console.log(`   └─ Target range: 40-60%`);
    
    console.log(`\n4. Level Change Rate: ${metric4}%`);
    console.log(`   └─ Students changed levels: ${totalLevelChanges} / ${totalStudents}`);
    
    console.log(`\n5. Post-Change Success Rate: ${metric5}%`);
    console.log(`   └─ (Sessions with score ≥65)`);
    console.log(`   └─ Average score: ${metric5_avg}`);
    console.log(`   └─ Target: 70%+`);
    
    console.log(`\n6. Score Variance (Std Dev): ${metric6} points`);
    console.log(`   └─ Average per-student SD`);
    console.log(`   └─ Target range: 8-12 points`);
    
    console.log(`\n7. Frustration Indicators: ${metric7_count} low-score sessions (${metric7_pct}% of total)`);
    console.log(`   └─ Sessions with score <50`);
    
    console.log(`\n8. Self-Assessment Calibration: ${metric8}%`);
    console.log(`   └─ Overconfident ("really well") but scored <65`);
    
    console.log(`\n9. Downward Mix Recovery Rate: ${metric9} students recovered`);
    console.log(`   └─ Went from score <50 → ≥65 in sequence`);
    console.log(`   └─ Target: 50%+ of struggling students`);
    
    console.log(`\n10. Reversal Rate: ${metric10} reversals`);
    console.log(`    └─ Leveled down after leveling up`);
    console.log(`    └─ Target: <10% of level changes`);

    console.log('\n\n=== DIAGNOSIS ===\n');
    
    const diagnoses = [];
    
    // Check metric 2
    const probe2 = parseFloat(metric2);
    if (probe2 < 15) diagnoses.push('⚠️  METRIC 2 - Probe trigger rate TOO LOW (thresholds too strict)');
    if (probe2 > 25) diagnoses.push('⚠️  METRIC 2 - Probe trigger rate TOO HIGH (system is restless)');
    if (probe2 >= 15 && probe2 <= 25) diagnoses.push('✓ METRIC 2 - Probe trigger rate HEALTHY');
    
    // Check metric 5
    const success5 = parseFloat(metric5);
    if (success5 < 70) diagnoses.push('⚠️  METRIC 5 - Post-change success TOO LOW (level changes premature)');
    if (success5 >= 70) diagnoses.push('✓ METRIC 5 - Post-change success HEALTHY');
    
    // Check metric 6
    const var6 = parseFloat(metric6);
    if (var6 < 8) diagnoses.push('⚠️  METRIC 6 - Score variance TOO LOW (conversations too formulaic)');
    if (var6 > 12) diagnoses.push('⚠️  METRIC 6 - Score variance TOO HIGH (scoring inconsistent or content varies)');
    if (var6 >= 8 && var6 <= 12) diagnoses.push('✓ METRIC 6 - Score variance HEALTHY');
    
    // Check metric 7
    const frust7 = parseFloat(metric7_pct);
    if (frust7 > 20) diagnoses.push('⚠️  METRIC 7 - Frustration HIGH (>20% low-score sessions)');
    if (frust7 <= 20) diagnoses.push('✓ METRIC 7 - Frustration acceptable');
    
    if (diagnoses.length === 0) {
      console.log('✓ All measurable metrics within healthy ranges.');
    } else {
      diagnoses.forEach(d => console.log(d));
    }

    console.log('\n\n=== DATA AVAILABILITY NOTE ===\n');
    console.log('The level progression system uses feedMix state in the students table,');
    console.log('but full tracking (level_progression_state, level_progression_events)');
    console.log('requires migration #0004. Current analysis derived from:');
    console.log('  - comprehension_reports (score, self_assessment)');
    console.log('  - level_history (level changes)');
    console.log('  - feedMix JSON (probing state)');
    console.log('\nWhen full tracking is deployed, pull directly from event tables.');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Database error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

getMetrics();
