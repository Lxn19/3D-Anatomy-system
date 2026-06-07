-- =============================================================================
-- seed.sql
-- 3D Anatomy Learning System — Sample Organ & Quiz Data
--
-- Run AFTER schema.sql:
--   psql -U <your_user> -d anatomy_db -f database/seed.sql
--
-- Inserts 16 organs across the four anatomical systems, plus one sample
-- quiz question per organ.
-- unity_ref matches the exact GameObject names/paths in the Unity scene.
-- =============================================================================

-- Use a transaction so the entire seed either succeeds or rolls back cleanly.
BEGIN;

-- ---------------------------------------------------------------------------
-- ORGANS
-- ---------------------------------------------------------------------------

INSERT INTO organs (name, system, description, fact, unity_ref) VALUES

-- Skeletal System
('Skull',          'Skeletal',     'The skull is the bony structure that forms the head and protects the brain. It consists of 22 bones fused together.',                         'The skull of a newborn baby has soft spots called fontanelles that allow the head to flex during birth.',            '[Root] Skeletal System/Skull'),
('Femur',          'Skeletal',     'The femur, or thigh bone, is the longest and strongest bone in the human body, connecting the hip to the knee.',                              'The femur can withstand forces of up to 1,700 pounds (7.5 kN).',                                                    '[Root] Skeletal System/Femur'),
('Spine',          'Skeletal',     'The vertebral column (spine) consists of 33 vertebrae and protects the spinal cord while supporting the body''s weight.',                     'The spine is slightly longer in the morning than at night due to fluid absorption between vertebral discs.',          '[Root] Skeletal System/Spine'),
('Ribcage',        'Skeletal',     'The ribcage consists of 12 pairs of ribs that protect the heart and lungs, while allowing expansion during breathing.',                        'The floating ribs (11th and 12th) are not attached to the sternum at all.',                                          '[Root] Skeletal System/Ribcage'),

-- Muscular System
('Heart',          'Circulatory',  'The heart is a muscular organ that pumps blood throughout the body via the circulatory system.',                                               'The heart beats approximately 100,000 times per day, pumping around 2,000 gallons (7,500 L) of blood.',             '[Root] Circulatory System/Heart'),
('Bicep',          'Muscular',     'The biceps brachii is a two-headed muscle located on the upper arm that enables forearm flexion and supination.',                              'The biceps attaches in two places on the shoulder — that is why it is called "biceps" (two heads).',                '[Root] Muscular System/Bicep'),
('Quadriceps',     'Muscular',     'The quadriceps femoris is a group of four muscles at the front of the thigh responsible for extending the knee.',                              'The quadriceps is the largest muscle group in the human body.',                                                      '[Root] Muscular System/Quadriceps'),
('Diaphragm',      'Muscular',     'The diaphragm is the primary muscle of respiration, separating the thoracic and abdominal cavities.',                                         'The diaphragm is the only skeletal muscle in the body that is absolutely essential for life.',                      '[Root] Muscular System/Diaphragm'),

-- Nervous System
('Brain',          'Nervous',      'The brain is the control center of the nervous system, regulating thought, memory, emotion, touch, motor skills, vision, and respiration.',   'The human brain generates approximately 12–25 watts of electricity — enough to power a small LED bulb.',            '[Root] Nervous System/Brain'),
('Spinal Cord',    'Nervous',      'The spinal cord is a long bundle of nerves that runs from the brainstem down through the vertebral column, transmitting signals between the brain and body.', 'The spinal cord stops growing in length around age 5, even though the spine continues to grow.',      '[Root] Nervous System/Spinal Cord'),
('Sciatic Nerve',  'Nervous',      'The sciatic nerve is the largest and longest nerve in the human body, running from the lower back through the buttocks to the leg.',          'The sciatic nerve can be as wide as your thumb at its thickest point.',                                              '[Root] Nervous System/Sciatic Nerve'),
('Cerebellum',     'Nervous',      'The cerebellum coordinates voluntary movements, balance, and fine motor control.',                                                             'Although the cerebellum is only 10% of the brain''s volume, it contains more than 50% of its neurons.',             '[Root] Nervous System/Cerebellum'),

-- Circulatory System
('Aorta',          'Circulatory',  'The aorta is the largest artery in the body, carrying oxygenated blood from the left ventricle of the heart to the rest of the body.',       'If the aorta were straightened out, it would be about the diameter of a garden hose.',                              '[Root] Circulatory System/Aorta'),
('Pulmonary Vein', 'Circulatory',  'The pulmonary veins carry oxygenated blood from the lungs back to the left atrium of the heart.',                                             'Pulmonary veins are unique — they are the only veins that carry oxygen-rich (not oxygen-poor) blood.',              '[Root] Circulatory System/Pulmonary Vein'),
('Left Lung',      'Circulatory',  'The left lung has two lobes and is slightly smaller than the right lung to accommodate the heart in the left side of the chest.',             'Your lungs are the only organs that can float on water due to the air sacs they contain.',                          '[Root] Circulatory System/Left Lung'),
('Right Lung',     'Circulatory',  'The right lung has three lobes and is slightly larger than the left lung, providing the majority of respiratory surface area.',               'An average adult breathes about 20,000 times per day, drawing about 11,000 litres of air.',                         '[Root] Circulatory System/Right Lung')

ON CONFLICT (name) DO NOTHING;  -- Safe to re-run: skip existing rows.

-- ---------------------------------------------------------------------------
-- QUIZ QUESTIONS  (one per organ, keyed by name sub-select)
-- ---------------------------------------------------------------------------

INSERT INTO quiz_questions (organ_id, question_text, correct_answer, option_a, option_b, option_c, option_d, difficulty) VALUES

((SELECT organ_id FROM organs WHERE name = 'Skull'),         'How many bones make up the adult human skull?',                             'B', '14', '22', '29', '8',          'easy'),
((SELECT organ_id FROM organs WHERE name = 'Femur'),         'Which joint does the femur connect to at its proximal end?',               'A', 'Hip', 'Knee', 'Ankle', 'Spine', 'easy'),
((SELECT organ_id FROM organs WHERE name = 'Spine'),         'How many vertebrae does the adult human spine contain?',                   'C', '24', '29', '33', '26',          'medium'),
((SELECT organ_id FROM organs WHERE name = 'Ribcage'),       'How many pairs of ribs does the human ribcage contain?',                  'B', '10', '12', '14', '8',           'easy'),
((SELECT organ_id FROM organs WHERE name = 'Heart'),         'Approximately how many times does the heart beat per day?',               'D', '50,000', '60,000', '80,000', '100,000', 'medium'),
((SELECT organ_id FROM organs WHERE name = 'Bicep'),         'What does "biceps" mean in reference to the biceps brachii muscle?',      'A', 'Two heads', 'Strong arm', 'Double joint', 'Upper limb', 'medium'),
((SELECT organ_id FROM organs WHERE name = 'Quadriceps'),    'How many individual muscles make up the quadriceps group?',               'B', '3', '4', '5', '2',              'medium'),
((SELECT organ_id FROM organs WHERE name = 'Diaphragm'),     'What is the primary function of the diaphragm?',                         'C', 'Digestion', 'Circulation', 'Respiration', 'Balance', 'easy'),
((SELECT organ_id FROM organs WHERE name = 'Brain'),         'Approximately how much of the body''s total energy does the brain consume?', 'B', '10%', '20%', '30%', '5%',   'hard'),
((SELECT organ_id FROM organs WHERE name = 'Spinal Cord'),   'At what age does the spinal cord typically stop growing in length?',     'A', '5', '10', '15', '18',            'hard'),
((SELECT organ_id FROM organs WHERE name = 'Sciatic Nerve'), 'What is notable about the sciatic nerve compared to other nerves?',     'C', 'Shortest nerve', 'Fastest signal', 'Largest and longest', 'Only motor nerve', 'medium'),
((SELECT organ_id FROM organs WHERE name = 'Cerebellum'),    'What percentage of the brain''s neurons does the cerebellum contain?',  'D', '10%', '20%', '30%', '50%',       'hard'),
((SELECT organ_id FROM organs WHERE name = 'Aorta'),         'From which chamber of the heart does the aorta carry blood away?',      'B', 'Right ventricle', 'Left ventricle', 'Left atrium', 'Right atrium', 'easy'),
((SELECT organ_id FROM organs WHERE name = 'Pulmonary Vein'),'What makes the pulmonary veins unique among all veins?',                'A', 'They carry oxygenated blood', 'They are the longest veins', 'They pass through the liver', 'They have no valves', 'medium'),
((SELECT organ_id FROM organs WHERE name = 'Left Lung'),     'Why is the left lung smaller than the right lung?',                     'C', 'Evolutionary adaptation', 'Fewer blood vessels', 'To accommodate the heart', 'Different lobe structure', 'easy'),
((SELECT organ_id FROM organs WHERE name = 'Right Lung'),    'How many lobes does the right lung have?',                              'B', '2', '3', '4', '1',               'easy')

ON CONFLICT DO NOTHING;

COMMIT;
