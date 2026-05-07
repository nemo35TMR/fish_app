class CreateFishingPlans < ActiveRecord::Migration[8.1]
  def change
    create_table :fishing_plans do |t|
      t.references :user, null: false, foreign_key: true
      t.references :lake, null: false, foreign_key: true
      t.references :fish_species, null: false, foreign_key: true
      t.references :lure, null: false, foreign_key: true
      t.text :notes
      t.string :status

      t.timestamps
    end
  end
end
